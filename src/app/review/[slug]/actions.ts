"use server";
import { checkFormToken, ipHash, newToken, sha256 } from "@/lib/antispam";
import { db } from "@/lib/db";
import { sendMail, siteLink } from "@/lib/mail";
import { bodyHash, computeFlags, emailHash, reviewSchema } from "@/lib/reviews";

export type ReviewState = { ok: boolean; errors?: Record<string, string>; message?: string };

export async function submitReview(_: ReviewState, fd: FormData): Promise<ReviewState> {
  if (String(fd.get("contact_fax") ?? "")) return { ok: true }; // honeypot: pretend success
  const tok = checkFormToken(String(fd.get("ft") ?? ""));
  if (tok === "too-fast") return { ok: false, message: "That was very quick — please read your review over and submit again." };
  if (tok !== "ok") return { ok: false, message: "This form has expired. Please reload the page and try again." };

  const p = reviewSchema.safeParse({ rating: fd.get("rating"), title: fd.get("title") || undefined, body: fd.get("body"), authorName: fd.get("authorName"), email: fd.get("email") });
  if (!p.success) {
    const errors: Record<string, string> = {};
    for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors };
  }
  const d = p.data;
  const business = await db.business.findFirst({ where: { slug: String(fd.get("business")), published: true } });
  if (!business) return { ok: false, message: "That business could not be found." };
  if (business.isSample) return { ok: false, message: "This is a sample business used for demonstration, so it can't be reviewed." };

  const ip = await ipHash();
  const eh = emailHash(d.email);
  const since = new Date(Date.now() - 86400_000);
  const [byEmail, byIp] = await Promise.all([db.review.count({ where: { authorEmailHash: eh, createdAt: { gte: since } } }), db.review.count({ where: { ipHash: ip, createdAt: { gte: since } } })]);
  if (byEmail >= 3 || byIp >= 5) return { ok: false, message: "You've submitted several reviews today. Please try again tomorrow." };

  const token = newToken();
  const manageUrl = siteLink(`/reviews/manage/${token}`);
  const existing = await db.review.findUnique({ where: { businessId_authorEmailHash: { businessId: business.id, authorEmailHash: eh } } });
  if (existing) {
    // One review per person per business. Respond identically (no account enumeration) and re-send the manage link.
    await db.review.update({ where: { id: existing.id }, data: { tokenHash: sha256(token) } });
    await sendMail(d.email, `Your PrimeStreet review of ${business.name}`, `You already have a review of ${business.name}. Manage or edit it here:\n\n${manageUrl}\n\nIf this wasn't you, ignore this email.`, { purpose: "reviews" });
    return { ok: true };
  }
  const flags = await computeFlags({ body: d.body, title: d.title, email: d.email, businessId: business.id, ipHash: ip });
  await db.review.create({
    data: {
      businessId: business.id, authorName: d.authorName, authorEmail: d.email, authorEmailHash: eh, rating: d.rating, title: d.title || null, body: d.body,
      status: "UNVERIFIED", flags: flags.join(",") || null, ipHash: ip, bodyHash: bodyHash(d.body), tokenHash: sha256(token),
    },
  });
  await sendMail(d.email, `Confirm your PrimeStreet review of ${business.name}`, `Thanks for reviewing ${business.name}.\n\nConfirm your email to send your review for moderation:\n\n${manageUrl}\n\nYour review won't be public until a PrimeStreet moderator approves it. You can edit or delete it at the same link at any time.\n\nIf you didn't write this review, ignore this email and it will never be published.`, { purpose: "reviews" });
  return { ok: true };
}
