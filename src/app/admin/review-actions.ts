"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail, siteLink } from "@/lib/mail";
import { recalcRating } from "@/lib/reviews";
import { bizPath } from "@/lib/queries";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (msg: string, tab = ""): never => redirect(`/admin/reviews?${tab ? `tab=${tab}&` : ""}msg=${encodeURIComponent(msg)}`);
const audit = (action: string, id: string, detail?: string) => db.auditLog.create({ data: { action, targetType: "Review", targetId: id, detail } });

export async function moderateReview(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id"), decision = s(fd, "decision"), note = s(fd, "note").slice(0, 500), tab = s(fd, "tab");
  const r = await db.review.findUnique({ where: { id }, include: { business: { include: { category: true, city: true } } } });
  if (!r) return back("Review not found", tab);
  if (decision === "PUBLISH") {
    if (r.status === "UNVERIFIED") return back("Email not confirmed — verify the email first or ask the reviewer to confirm", tab);
    await db.review.update({ where: { id }, data: { status: "PUBLISHED", moderatedAt: new Date(), moderationNote: note || null } });
    await db.reviewReport.updateMany({ where: { reviewId: id, status: "OPEN" }, data: { status: "DISMISSED" } });
    if (r.status === "PENDING") await sendMail(r.authorEmail, `Your review of ${r.business.name} is live`, `Thanks — your review is now published:\n\n${siteLink(bizPath(r.business))}#review-${r.id}\n\nManage it any time via your original email link.`);
  } else if (decision === "REJECT") {
    if (note.length < 5) return back("Add a short reason when rejecting", tab);
    await db.review.update({ where: { id }, data: { status: "REJECTED", moderatedAt: new Date(), moderationNote: note } });
    await db.reviewReport.updateMany({ where: { reviewId: id, status: "OPEN" }, data: { status: "ACTIONED" } });
    await sendMail(r.authorEmail, `About your review of ${r.business.name}`, `We couldn't publish your review of ${r.business.name}.\n\nReason: ${note}\n\nOur review guidelines are on ${siteLink("/about#standards")}.`, { purpose: "reviews" });
  } else if (decision === "HOLD") {
    await db.review.update({ where: { id }, data: { status: "HELD", moderatedAt: new Date(), moderationNote: note || null } });
  } else if (decision === "VERIFY_EMAIL") {
    // Manual override for when emails can't be delivered. Audit-logged; use sparingly.
    if (r.status !== "UNVERIFIED") return back("Already confirmed", tab);
    await db.review.update({ where: { id }, data: { status: "PENDING", emailVerifiedAt: new Date(), flags: [...(r.flags ? r.flags.split(",") : []), "email-manually-verified"].join(",") } });
  } else if (decision === "DELETE") {
    await db.review.delete({ where: { id } });
  } else return back("Unknown action", tab);
  await recalcRating(r.businessId);
  await audit(`REVIEW_${decision}`, id, note || r.business.name);
  revalidatePath("/", "layout");
  back({ PUBLISH: "Published", REJECT: "Rejected", HOLD: "Held (hidden)", VERIFY_EMAIL: "Email marked verified → now pending", DELETE: "Deleted" }[decision] ?? "Done", tab);
}

export async function dismissReports(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  await db.reviewReport.updateMany({ where: { reviewId: id, status: "OPEN" }, data: { status: "DISMISSED" } });
  await audit("REVIEW_REPORTS_DISMISSED", id);
  back("Reports dismissed", "reported");
}

/** Business responses are only allowed on claimed/verified profiles. Owner self-service arrives with Phase 5 accounts. */
export async function respondToReview(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id"), response = s(fd, "response"), tab = s(fd, "tab");
  const r = await db.review.findUnique({ where: { id }, include: { business: true } });
  if (!r) return back("Review not found", tab);
  if (r.business.claimStatus !== "CLAIMED" && r.business.claimStatus !== "VERIFIED") return back("Only claimed or verified businesses can respond. Approve their claim first.", tab);
  if (response && (response.length < 10 || response.length > 1500)) return back("Response must be 10–1500 characters (leave empty to remove it)", tab);
  await db.review.update({ where: { id }, data: { response: response || null, respondedAt: response ? new Date() : null } });
  await audit(response ? "REVIEW_RESPONSE_SET" : "REVIEW_RESPONSE_REMOVED", id, r.business.name);
  revalidatePath("/", "layout");
  back(response ? "Response saved" : "Response removed", tab);
}
