"use server";
import { revalidatePath } from "next/cache";
import { sha256 } from "@/lib/antispam";
import { db } from "@/lib/db";
import { bodyHash, computeFlags, recalcRating, reviewSchema } from "@/lib/reviews";

export type ManageState = { ok?: boolean; errors?: Record<string, string>; message?: string; deleted?: boolean };

const byToken = (token: string) => db.review.findFirst({ where: { tokenHash: sha256(token) }, include: { business: true } });

/** POST (not GET) so email-scanner link prefetching can't confirm a review by itself. */
export async function confirmEmail(token: string): Promise<ManageState> {
  const r = await byToken(token);
  if (!r) return { message: "This link is no longer valid." };
  if (r.status === "UNVERIFIED") await db.review.update({ where: { id: r.id }, data: { status: "PENDING", emailVerifiedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Email confirmed. Your review is now with our moderators." };
}

export async function editReview(token: string, _: ManageState, fd: FormData): Promise<ManageState> {
  const r = await byToken(token);
  if (!r) return { message: "This link is no longer valid." };
  if (r.status === "REJECTED") return { message: "This review was not published and can't be edited. You're welcome to write a new one for another business." };
  const p = reviewSchema.omit({ email: true }).safeParse({ rating: fd.get("rating"), title: fd.get("title") || undefined, body: fd.get("body"), authorName: fd.get("authorName") });
  if (!p.success) {
    const errors: Record<string, string> = {};
    for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = p.data;
  const wasLive = r.status === "PUBLISHED" || r.status === "HELD";
  const flags = await computeFlags({ body: d.body, title: d.title, email: r.authorEmail, businessId: r.businessId, ipHash: "" });
  await db.review.update({
    where: { id: r.id },
    data: { rating: d.rating, title: d.title || null, body: d.body, authorName: d.authorName, bodyHash: bodyHash(d.body), flags: [...new Set([...(flags.filter((f) => f !== "duplicate-text" || r.bodyHash !== bodyHash(d.body)))])].join(",") || null, editedAt: new Date(), status: wasLive ? "PENDING" : r.status, moderatedAt: wasLive ? null : r.moderatedAt },
  });
  await recalcRating(r.businessId);
  revalidatePath("/", "layout");
  return { ok: true, message: wasLive ? "Saved. Because your review was already live, edits go back to our moderators before reappearing." : "Saved." };
}

export async function deleteReview(token: string): Promise<ManageState> {
  const r = await byToken(token);
  if (!r) return { message: "This link is no longer valid." };
  await db.review.delete({ where: { id: r.id } }); // hard delete: removes the reviewer's personal data
  await recalcRating(r.businessId);
  revalidatePath("/", "layout");
  return { deleted: true, message: "Your review and email address have been deleted." };
}
