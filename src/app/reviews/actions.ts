"use server";
import { checkFormToken, ipHash } from "@/lib/antispam";
import { db } from "@/lib/db";
import { HOLD_AFTER_REPORTS, REPORT_REASONS, recalcRating } from "@/lib/reviews";

export type ReportState = { ok?: boolean; message?: string };

export async function reportReview(_: ReportState, fd: FormData): Promise<ReportState> {
  if (String(fd.get("contact_fax") ?? "")) return { ok: true };
  if (checkFormToken(String(fd.get("ft") ?? ""), { minMs: 1500 }) !== "ok") return { message: "Please reload the page and try again." };
  const reason = String(fd.get("reason") ?? "");
  if (!(reason in REPORT_REASONS)) return { message: "Choose a reason." };
  const details = String(fd.get("details") ?? "").trim().slice(0, 500);
  if (reason === "OTHER" && details.length < 10) return { message: "Please tell us a little more." };
  const review = await db.review.findFirst({ where: { id: String(fd.get("reviewId")), status: "PUBLISHED" } });
  if (!review) return { message: "That review is no longer available." };

  const key = await ipHash();
  const today = await db.reviewReport.count({ where: { reporterKey: key, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  if (today >= 10) return { message: "You've sent a lot of reports today. Please try again tomorrow." };
  const dupe = await db.reviewReport.findUnique({ where: { reviewId_reporterKey: { reviewId: review.id, reporterKey: key } } });
  if (dupe) return { ok: true, message: "Thanks — we already have your report and will look at it." };

  await db.reviewReport.create({ data: { reviewId: review.id, reason, details: details || null, reporterKey: key, reporterType: fd.get("business") === "on" ? "BUSINESS" : "USER" } });
  const open = await db.reviewReport.count({ where: { reviewId: review.id, status: "OPEN" } });
  if (open >= HOLD_AFTER_REPORTS) {
    // Distinct reporters (one per IP) hide the review pending a human decision; admins can restore it.
    await db.review.update({ where: { id: review.id }, data: { status: "HELD", flags: [...new Set([...(review.flags?.split(",") ?? []), "held-after-reports"])].filter(Boolean).join(",") } });
    await recalcRating(review.businessId);
  }
  return { ok: true, message: "Thanks. A moderator will review this report." };
}
