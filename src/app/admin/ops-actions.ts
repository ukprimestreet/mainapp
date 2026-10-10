"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const admin = () => process.env.ADMIN_EMAIL ?? "admin";

/** Publish a correction against an article. Owning a mistake in public is the point of the feature. */
export async function addCorrection(form: FormData) {
  await requireAdmin();
  const articleId = s(form, "articleId"), summary = s(form, "summary").trim();
  const back = (m: string) => redirect(`/admin/corrections?msg=${encodeURIComponent(m)}`);
  if (!articleId) back("Choose the article this correction belongs to.");
  if (summary.length < 15) back("Say what was wrong in at least 15 characters — readers see this.");
  const article = await db.article.findUnique({ where: { id: articleId }, include: { author: true } });
  if (!article) back("That article no longer exists.");

  await db.correction.create({
    data: {
      articleId, summary, detail: s(form, "detail").trim() || null,
      kind: ["CORRECTION", "CLARIFICATION", "UPDATE"].includes(s(form, "kind")) ? s(form, "kind") : "CORRECTION",
      isPublic: s(form, "isPublic") !== "0",
      raisedBy: s(form, "raisedBy").trim() || null,
      correctedBy: admin(),
    },
  });
  await db.auditLog.create({ data: { action: "Correction published", targetType: "Article", targetId: articleId, detail: summary.slice(0, 160) } });
  if (article!.authorId) {
    await notify("AUTHOR", article!.authorId, "SYSTEM", `A correction was published on "${article!.title}"`, summary, `/write/articles/${articleId}`);
  }
  back("Correction published. It now appears on the article.");
}

export async function removeCorrection(form: FormData) {
  await requireAdmin();
  const id = s(form, "id");
  await db.correction.delete({ where: { id } }).catch(() => {});
  await db.auditLog.create({ data: { action: "Correction removed", targetType: "Correction", targetId: id, detail: admin() } });
  redirect("/admin/corrections?msg=Removed");
}

/** Editable settings. Secrets stay in the environment; these are the things an editor may reasonably change. */
export async function saveSetting(form: FormData) {
  await requireAdmin();
  const key = s(form, "key"), value = s(form, "value").trim();
  await db.setting.upsert({ where: { key }, create: { key, value, updatedBy: admin() }, update: { value, updatedBy: admin() } });
  await db.auditLog.create({ data: { action: "Setting changed", targetType: "Setting", targetId: key, detail: `${value.slice(0, 80)} — ${admin()}` } });
  redirect(`/admin/settings?msg=${encodeURIComponent(`Saved ${key}.`)}`);
}
