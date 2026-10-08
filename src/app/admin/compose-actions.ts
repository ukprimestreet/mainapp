"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { adminAuthor } from "@/lib/author-auth";
import { db } from "@/lib/db";
import { blocksToMarkdown, blocksToPlainText, parseBlocks, usefulBlocks } from "@/lib/blocks";
import { readyToSubmit } from "@/lib/editorial-flow";
import { ARTICLE_TYPES } from "@/lib/constants";
import { slugifyName } from "@/lib/authors";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const back = (id: string, msg: string) => redirect(`/admin/compose/${id}?msg=${encodeURIComponent(msg)}`);

async function freeArticleSlug(title: string, exceptId?: string) {
  const base = slugifyName(title) || "untitled";
  for (let i = 1; i < 60; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await db.article.findUnique({ where: { slug } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Admin writing in the same editor as an author. The piece is filed under the house author account
 * (ADMIN_AUTHOR_EMAIL, cc@primestreet.uk by default), so whoever owns that account finds this draft in their
 * own panel and can carry on editing it, or sees it among their published work if an admin publishes it.
 */
export async function adminCreateArticle() {
  await requireAdmin();
  const house = await adminAuthor();
  const created = await db.article.create({
    data: {
      slug: await freeArticleSlug("untitled-" + Date.now().toString(36)),
      type: "NEWS", title: "", standfirst: "", body: "", blocks: "[]",
      status: "DRAFT", authorId: house.id, isSample: false,
    },
  });
  redirect(`/admin/compose/${created.id}`);
}

export async function adminSaveArticle(form: FormData) {
  await requireAdmin();
  const id = s(form, "id");
  const article = await db.article.findUnique({ where: { id } });
  if (!article) redirect("/admin/compose?msg=That+piece+no+longer+exists");

  const title = s(form, "title").trim();
  const blocks = usefulBlocks(parseBlocks(s(form, "blocks")));
  const type = s(form, "type") in ARTICLE_TYPES ? s(form, "type") : article!.type;
  const locationId = s(form, "locationId") || null;

  await db.article.update({
    where: { id },
    data: {
      title, type,
      slug: title && slugifyName(title) !== article!.slug ? await freeArticleSlug(title, id) : article!.slug,
      standfirst: s(form, "standfirst").trim(),
      blocks: JSON.stringify(blocks),
      body: blocksToMarkdown(blocks),
      imageUrl: s(form, "imageUrl").trim() || null,
      imageAlt: s(form, "imageAlt").trim() || null,
      imageCredit: s(form, "imageCredit").trim() || null,
      disclosure: ["EDITORIAL", "SPONSORED", "PARTNER", "ADVERTORIAL"].includes(s(form, "disclosure")) ? s(form, "disclosure") : "EDITORIAL",
      sponsorName: s(form, "sponsorName").trim() || null,
      locationId,
      cityId: locationId ? (await db.location.findUnique({ where: { id: locationId }, select: { cityId: true } }))?.cityId ?? null : null,
    },
  });
  back(id, "Saved. The author who owns this account can carry on editing it in their own panel.");
}

/** An admin publishes directly: they are the reviewer, so there is nobody left to approve it. */
export async function adminPublishArticle(form: FormData) {
  await requireAdmin();
  const id = s(form, "id");
  const article = await db.article.findUnique({ where: { id } });
  if (!article) redirect("/admin/compose?msg=That+piece+no+longer+exists");

  const blocks = usefulBlocks(parseBlocks(article!.blocks));
  const ready = readyToSubmit({ ...article!, body: blocksToPlainText(blocks) || article!.body });
  if (!ready.ok) back(id, ready.problems.join(" "));

  await db.$transaction([
    db.article.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: article!.publishedAt ?? new Date() } }),
    db.articleReview.create({ data: { articleId: id, decision: "APPROVED", note: "Written and published by an editor.", reviewer: process.env.ADMIN_EMAIL ?? "admin" } }),
    db.auditLog.create({ data: { action: "Article published by admin", targetType: "Article", targetId: id, detail: article!.title } }),
  ]);
  redirect(`/admin/articles?msg=${encodeURIComponent(`Published "${article!.title}".`)}`);
}
