import { z } from "zod";
import { sha256, isDisposableEmail } from "./antispam";
import { websiteHost } from "./business";
import { db } from "./db";

export const REVIEW_STATUS = { UNVERIFIED: "Awaiting email confirmation", PENDING: "Awaiting moderation", PUBLISHED: "Published", HELD: "Held (hidden)", REJECTED: "Rejected" } as const;
export { REPORT_REASONS } from "./reasons";
export const HOLD_AFTER_REPORTS = 3; // distinct reporters

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5").max(5, "Choose a rating from 1 to 5"),
  title: z.string().trim().max(80, "Title is over 80 characters").optional(),
  body: z.string().trim().min(40, "Tell us a bit more — at least 40 characters").max(2000, "Review is over 2000 characters"),
  authorName: z.string().trim().min(2, "Enter the name to show").max(40, "Name is over 40 characters"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
});

export const emailHash = (email: string) => sha256(email.trim().toLowerCase());
export const bodyHash = (body: string) => sha256(body.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());

const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|co\.uk|uk|net|org|io|biz|info)\b/i;
const PHONE_RE = /(\+?\d[\d\s().-]{8,}\d)/;
const SHOUT_RE = /[A-Z]{12,}/;

/** Soft anti-abuse signals: they never auto-publish or auto-reject; they route to moderators with a visible reason. */
export async function computeFlags(opts: { body: string; title?: string; email: string; businessId: string; ipHash: string }): Promise<string[]> {
  const flags: string[] = [];
  const text = `${opts.title ?? ""} ${opts.body}`;
  if (URL_RE.test(text)) flags.push("contains-link");
  if (PHONE_RE.test(text)) flags.push("contains-phone");
  if (SHOUT_RE.test(text)) flags.push("shouting");
  if (isDisposableEmail(opts.email)) flags.push("disposable-email");
  const biz = await db.business.findUnique({ where: { id: opts.businessId }, select: { websiteHost: true, email: true } });
  const dom = opts.email.split("@")[1];
  if (biz?.websiteHost && dom && (dom === biz.websiteHost || dom.endsWith(`.${biz.websiteHost}`))) flags.push("email-matches-business-domain");
  if (biz?.email && biz.email.toLowerCase() === opts.email) flags.push("email-matches-business-email");
  const dupe = await db.review.count({ where: { bodyHash: bodyHash(opts.body) } });
  if (dupe) flags.push("duplicate-text");
  const sameIp = await db.review.count({ where: { businessId: opts.businessId, ipHash: opts.ipHash } });
  if (sameIp) flags.push("same-ip-as-another-review-of-this-business");
  const burst = await db.review.count({ where: { businessId: opts.businessId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (burst >= 3) flags.push("review-burst");
  return flags;
}

export async function recalcRating(businessId: string) {
  const agg = await db.review.aggregate({ where: { businessId, status: "PUBLISHED" }, _avg: { rating: true }, _count: true });
  await db.business.update({ where: { id: businessId }, data: { ratingAvg: agg._count ? Math.round((agg._avg.rating ?? 0) * 10) / 10 : null, ratingCount: agg._count } });
}

export async function ratingSummary(businessId: string) {
  const rows = await db.review.groupBy({ by: ["rating"], where: { businessId, status: "PUBLISHED" }, _count: true });
  const dist = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: rows.find((x) => x.rating === r)?._count ?? 0 }));
  return dist;
}

export const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
export { websiteHost };
