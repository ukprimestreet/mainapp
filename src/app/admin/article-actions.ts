"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { safeUrl, slugify } from "@/lib/business";
import { db } from "@/lib/db";
import { createRedirect } from "@/lib/redirects";
import { ARTICLE_TYPES } from "@/lib/constants";
import { londonToDate, validateArticle, type ArticleInput, type Intent } from "@/lib/editorial";

export type ArticleState = { errors?: Record<string, string>; message?: string };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const audit = (action: string, targetId: string, detail?: string) => db.auditLog.create({ data: { action, targetType: "Article", targetId, detail } });

export async function saveArticle(_: ArticleState, fd: FormData): Promise<ArticleState> {
  await requireAdmin();
  const id = s(fd, "id") || undefined;
  const intent = (s(fd, "intent") || "save") as Intent;
  if (!["save", "publish", "schedule", "unpublish"].includes(intent)) return { message: "Unknown action" };
  const title = s(fd, "title");
  const input: ArticleInput = {
    type: s(fd, "type"), disclosure: s(fd, "disclosure") || "EDITORIAL", title,
    slug: s(fd, "slug") || slugify(title), standfirst: s(fd, "standfirst"), body: String(fd.get("body") ?? "").replace(/\r\n/g, "\n").trim(),
    imageUrl: s(fd, "imageUrl"), imageAlt: s(fd, "imageAlt"), imageCredit: s(fd, "imageCredit"), sponsorName: s(fd, "sponsorName"),
    seoTitle: s(fd, "seoTitle"), seoDescription: s(fd, "seoDescription"), authorId: s(fd, "authorId"), locationId: s(fd, "locationId"),
    featured: fd.get("featured") === "on", businessIds: fd.getAll("businessIds").map(String).filter(Boolean), publishedAt: s(fd, "publishedAt"),
  };
  const existing = id ? await db.article.findUnique({ where: { id } }) : null;
  if (id && !existing) return { message: "Article not found" };

  // "unpublish" and plain "save" of a draft only need the light draft checks
  // editing a LIVE article re-checks the publish rules so it can never become invalid while public
  const checkAs: Intent = intent === "unpublish" ? "save" : intent === "save" && existing?.status === "PUBLISHED" ? "publish" : intent;
  const errors = await validateArticle(input, checkAs, id);
  const found = input.businessIds.length ? await db.business.count({ where: { id: { in: input.businessIds } } }) : 0;
  if (found !== input.businessIds.length) errors.businessIds = "A linked business no longer exists";
  if (input.authorId && !(await db.author.findUnique({ where: { id: input.authorId } }))) errors.authorId = "Author not found";
  if (Object.keys(errors).length) return { errors, message: "Please fix the highlighted fields." };

  let status = existing?.status ?? "DRAFT";
  let publishedAt = existing?.publishedAt ?? null;
  if (intent === "publish") { status = "PUBLISHED"; if (!publishedAt || publishedAt.getTime() > Date.now()) publishedAt = new Date(); }
  if (intent === "schedule") { status = "PUBLISHED"; publishedAt = londonToDate(input.publishedAt!)!; }
  if (intent === "unpublish") { status = "DRAFT"; publishedAt = null; }

  // An article belongs to the city of the area it is about, so city hubs and city-scoped search stay correct.
  const locCity = input.locationId ? (await db.location.findUnique({ where: { id: input.locationId }, select: { cityId: true } }))?.cityId ?? null : null;
  const data = {
    type: input.type, disclosure: input.disclosure, title: input.title, slug: input.slug, standfirst: input.standfirst, body: input.body,
    imageUrl: safeUrl(input.imageUrl), imageAlt: input.imageAlt || null, imageCredit: input.imageCredit || null,
    sponsorName: input.disclosure === "EDITORIAL" ? null : input.sponsorName || null,
    seoTitle: input.seoTitle || null, seoDescription: input.seoDescription || null,
    authorId: input.authorId, locationId: input.locationId || null, cityId: locCity, featured: !!input.featured, status, publishedAt,
  };
  const article = existing
    ? await db.article.update({ where: { id: existing.id }, data })
    : await db.article.create({ data: { ...data, isSample: false } });
  // a live article whose URL changed (slug or type) keeps its old URL alive with a permanent redirect
  if (existing && existing.status === "PUBLISHED" && !existing.isSample && (existing.slug !== article.slug || existing.type !== article.type)) {
    const typePath = (t: string) => ARTICLE_TYPES[t as keyof typeof ARTICLE_TYPES]?.path;
    if (typePath(existing.type) && typePath(article.type)) await createRedirect(`/${typePath(existing.type)}/${existing.slug}`, `/${typePath(article.type)}/${article.slug}`, "Article URL changed");
  }
  await db.articleBusiness.deleteMany({ where: { articleId: article.id } });
  if (input.businessIds.length) await db.articleBusiness.createMany({ data: input.businessIds.map((businessId) => ({ articleId: article.id, businessId })) });

  // podcast reuse: link/unlink one episode to this article
  const episodeId = s(fd, "episodeId");
  await db.podcastEpisode.updateMany({ where: { articleId: article.id, ...(episodeId ? { id: { not: episodeId } } : {}) }, data: { articleId: null } });
  if (episodeId) await db.podcastEpisode.update({ where: { id: episodeId }, data: { articleId: article.id } });

  await audit(`ARTICLE_${existing ? intent.toUpperCase() : "CREATE_" + intent.toUpperCase()}`, article.id, article.title);
  revalidatePath("/", "layout");
  const msg = { save: "Saved", publish: "Published", schedule: "Scheduled", unpublish: "Unpublished — back to draft" }[intent];
  redirect(`/admin/articles/${article.id}?msg=${encodeURIComponent(msg)}`);
}

export async function deleteArticle(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const a = await db.article.findUnique({ where: { id } });
  if (!a) redirect("/admin/articles?msg=Not%20found");
  if (a.status === "PUBLISHED" && !a.isSample) redirect(`/admin/articles/${id}?msg=${encodeURIComponent("Unpublish before deleting")}`);
  await db.podcastEpisode.updateMany({ where: { articleId: id }, data: { articleId: null } });
  await db.article.delete({ where: { id } }); // ArticleBusiness cascades
  await audit("ARTICLE_DELETE", id, a.title);
  revalidatePath("/", "layout");
  redirect("/admin/articles?msg=Deleted");
}

export type AuthorState = { errors?: Record<string, string>; message?: string };
export async function saveAuthor(_: AuthorState, fd: FormData): Promise<AuthorState> {
  await requireAdmin();
  const id = s(fd, "id") || undefined;
  const name = s(fd, "name"), role = s(fd, "role"), bio = s(fd, "bio");
  const slug = s(fd, "slug") || slugify(name);
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Name is required";
  if (!slug || slug !== slugify(slug)) errors.slug = "Slug may only contain lowercase letters, numbers and hyphens";
  else { const c = await db.author.findUnique({ where: { slug } }); if (c && c.id !== id) errors.slug = "Slug already in use"; }
  if (bio.length > 600) errors.bio = "Bio is over 600 characters";
  if (Object.keys(errors).length) return { errors };
  const a = id ? await db.author.update({ where: { id }, data: { name, slug, role: role || null, bio: bio || null } }) : await db.author.create({ data: { name, slug, role: role || null, bio: bio || null } });
  await db.auditLog.create({ data: { action: id ? "AUTHOR_UPDATE" : "AUTHOR_CREATE", targetType: "Author", targetId: a.id, detail: name } });
  revalidatePath("/", "layout");
  redirect(`/admin/authors?msg=${encodeURIComponent("Saved")}`);
}

export async function deleteAuthor(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const n = await db.article.count({ where: { authorId: id } });
  if (n) redirect(`/admin/authors?msg=${encodeURIComponent(`Can't delete: author has ${n} article(s)`)}`);
  await db.author.delete({ where: { id } });
  redirect("/admin/authors?msg=Deleted");
}
