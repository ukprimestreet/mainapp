"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuthor, requireOwnArticle } from "@/lib/author-auth";
import { canSubmit } from "@/lib/author-profile";
import { blockProblems, blocksToMarkdown, blocksToPlainText, parseBlocks, usefulBlocks } from "@/lib/blocks";
import { readyToSubmit } from "@/lib/editorial-flow";
import { ARTICLE_TYPES } from "@/lib/constants";
import { slugifyName } from "@/lib/authors";
import { sendMail, siteLink } from "@/lib/mail";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const back = (id: string, msg: string) => redirect(`/write/articles/${id}?msg=${encodeURIComponent(msg)}`);

async function freeArticleSlug(title: string, exceptId?: string) {
  const base = slugifyName(title) || "untitled";
  for (let i = 1; i < 60; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await db.article.findUnique({ where: { slug } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Start a piece. Blocked while the profile is incomplete, so nobody writes 2,000 words only to be stopped. */
export async function createArticle() {
  const me = await requireAuthor();
  const gate = canSubmit(me);
  if (!gate.ok) redirect("/write/profile?msg=" + encodeURIComponent(gate.reason));
  const created = await db.article.create({
    data: {
      slug: await freeArticleSlug("untitled-" + Date.now().toString(36)),
      type: "NEWS", title: "", standfirst: "", body: "", blocks: "[]",
      status: "DRAFT", authorId: me.id, isSample: false,
    },
  });
  redirect(`/write/articles/${created.id}`);
}

/** Save a draft. Deliberately permissive: an author should never lose work to a validation rule. */
export async function saveArticle(form: FormData) {
  const id = s(form, "id");
  const { article } = await requireOwnArticle(id);
  if (article.status === "SUBMITTED") back(id, "This piece is with an editor. Wait for their decision before editing.");
  if (article.status === "PUBLISHED") back(id, "This piece is live. Ask an editor to unpublish it before editing.");

  const title = s(form, "title").trim();
  const blocks = usefulBlocks(parseBlocks(s(form, "blocks")));
  const type = s(form, "type") in ARTICLE_TYPES ? s(form, "type") : article.type;
  const slug = title && slugifyName(title) !== article.slug ? await freeArticleSlug(title, id) : article.slug;

  await db.article.update({
    where: { id },
    data: {
      title, type, slug,
      standfirst: s(form, "standfirst").trim(),
      blocks: JSON.stringify(blocks),
      body: blocksToMarkdown(blocks), // keeps search, reading time and the link audit working from one place
      imageUrl: s(form, "imageUrl").trim() || null,
      imageAlt: s(form, "imageAlt").trim() || null,
      imageCredit: s(form, "imageCredit").trim() || null,
      disclosure: ["EDITORIAL", "SPONSORED", "PARTNER", "ADVERTORIAL"].includes(s(form, "disclosure")) ? s(form, "disclosure") : "EDITORIAL",
      sponsorName: s(form, "sponsorName").trim() || null,
      locationId: s(form, "locationId") || null,
      cityId: s(form, "locationId") ? (await db.location.findUnique({ where: { id: s(form, "locationId") }, select: { cityId: true } }))?.cityId ?? null : null,
    },
  });
  back(id, "Draft saved.");
}

/** Send it to an editor. Both gates apply: the profile must be complete and the piece must be finished. */
export async function submitArticle(form: FormData) {
  const id = s(form, "id");
  const { author, article } = await requireOwnArticle(id);
  if (article.status !== "DRAFT") back(id, "Only a draft can be sent for review.");

  const gate = canSubmit(author);
  if (!gate.ok) redirect("/write/profile?msg=" + encodeURIComponent(gate.reason));

  const blocks = usefulBlocks(parseBlocks(article.blocks));
  const plain = blocksToPlainText(blocks) || article.body;
  const ready = readyToSubmit({ ...article, body: plain });
  if (!ready.ok) back(id, ready.problems.join(" "));
  const problems = blockProblems(blocks);
  if (problems.length) back(id, problems.join(" "));

  await db.article.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sendMail(
      adminEmail,
      `For review: ${article.title}`,
      [`${author.name} has submitted "${article.title}" for review.`, "", siteLink(`/admin/review/${id}`), "", "PrimeStreet"].join("\n"),
    );
  }
  redirect("/write/articles?msg=" + encodeURIComponent("Sent for review. An editor will come back to you with a decision and a reason."));
}

/** Pull a piece back out of the queue while no editor has ruled on it. */
export async function withdrawArticle(form: FormData) {
  const id = s(form, "id");
  const { article } = await requireOwnArticle(id);
  if (article.status !== "SUBMITTED") back(id, "That piece is not in review.");
  await db.article.update({ where: { id }, data: { status: "DRAFT", submittedAt: null } });
  back(id, "Pulled back out of review. It is a draft again.");
}

export async function deleteArticle(form: FormData) {
  const id = s(form, "id");
  const { article } = await requireOwnArticle(id);
  if (article.status === "PUBLISHED") back(id, "Published pieces can't be deleted here — ask an editor.");
  await db.article.delete({ where: { id } });
  redirect("/write/articles?msg=" + encodeURIComponent("Draft deleted."));
}
