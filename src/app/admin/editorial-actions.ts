"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { DECISIONS, type Decision } from "@/lib/editorial-flow";
import { sendMail, siteLink } from "@/lib/mail";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const back = (id: string, msg: string) => redirect(`/admin/review/${id}?msg=${encodeURIComponent(msg)}`);

/**
 * An editor's decision on a submitted piece. A note is mandatory either way: an author never receives a
 * verdict without a reason, including an approval, where the note is the editor's feedback on what worked.
 */
export async function decide(form: FormData) {
  await requireAdmin();
  const id = s(form, "id");
  const decision = s(form, "decision") as Decision;
  const note = s(form, "note").trim();
  const reviewer = process.env.ADMIN_EMAIL ?? "admin";

  const article = await db.article.findUnique({ where: { id }, include: { author: true } });
  if (!article) redirect("/admin/review?msg=That+piece+no+longer+exists");
  if (!(decision in DECISIONS)) back(id, "Choose approve or request changes.");
  if (note.length < 10) back(id, "Add a note of at least 10 characters — the author sees this and deserves a reason.");
  if (article!.status !== "SUBMITTED") back(id, "That piece is not waiting for review.");

  const approved = decision === "APPROVED";
  await db.$transaction([
    db.articleReview.create({ data: { articleId: id, decision, note, reviewer } }),
    db.article.update({
      where: { id },
      data: approved ? { status: "PUBLISHED", publishedAt: article!.publishedAt ?? new Date() } : { status: "DRAFT" },
    }),
    db.auditLog.create({
      data: {
        action: approved ? "Article approved" : "Article changes requested",
        targetType: "Article", targetId: id, detail: `${article!.title} — ${reviewer}`,
      },
    }),
  ]);

  if (article!.author.email) {
    const path = ARTICLE_TYPES[article!.type as ArticleType]?.path ?? "news";
    const lines = [
      `${article!.author.name},`, "",
      approved
        ? `Your piece "${article!.title}" has been approved and is now live:`
        : `An editor has read "${article!.title}" and asked for some changes before it goes live.`,
      approved ? siteLink(`/${path}/${article!.slug}`) : `Your draft is waiting here: ${siteLink(`/write/articles/${id}`)}`,
      "", "Editor's note:", note, "", "PrimeStreet",
    ];
    await sendMail(
      article!.author.email,
      approved ? `Published: ${article!.title}` : `Changes requested: ${article!.title}`,
      lines.join("\n"),
      { purpose: "editorial" },
    );
  }
  redirect(`/admin/review?msg=${encodeURIComponent(approved ? `Published "${article!.title}".` : `Sent "${article!.title}" back with feedback.`)}`);
}
