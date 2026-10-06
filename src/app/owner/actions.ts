"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ipHash, sha256 } from "@/lib/antispam";
import { safeUrl, websiteHost } from "@/lib/business";
import { refreshGeo } from "@/lib/geo-db";
import { db } from "@/lib/db";
import { REPORT_REASONS } from "@/lib/reasons";
import { clearOwnerSession, issueLoginLink, normaliseHours, requireBusiness, requireOwner, setOwnerSession } from "@/lib/owner";

export type OState = { ok?: boolean; message?: string; errors?: Record<string, string> };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const errs = (e: z.ZodError) => { const o: Record<string, string> = {}; for (const i of e.issues) o[String(i.path[0])] ??= i.message; return o; };

// ---------- sign in (passwordless) ----------
export async function requestLogin(_: OState, fd: FormData): Promise<OState> {
  const p = z.string().trim().toLowerCase().email().max(200).safeParse(fd.get("email"));
  if (!p.success) return { errors: { email: "Enter a valid email address" } };
  const ip = await ipHash();
  const hour = new Date(Date.now() - 3600_000);
  if ((await db.ownerLoginToken.count({ where: { ipHash: ip, createdAt: { gte: hour } } })) >= 10) return { message: "Too many sign-in requests. Please try again later." };
  const owner = await db.owner.findUnique({ where: { email: p.data } });
  // Identical response whether or not the address has an account (no enumeration); per-account cap of 3 links/hour.
  if (owner && (await db.ownerLoginToken.count({ where: { ownerId: owner.id, createdAt: { gte: hour } } })) < 3) await issueLoginLink(owner.id, owner.email, ip);
  return { ok: true };
}

/** Invoked by a POST button on the emailed link page, so link scanners can't burn the single-use token. */
export async function consumeLogin(token: string): Promise<OState> {
  const row = await db.ownerLoginToken.findUnique({ where: { tokenHash: sha256(token) }, include: { owner: true } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return { message: "This sign-in link has expired or was already used. Request a new one." };
  const claimed = await db.ownerLoginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } }); // atomic single use
  if (claimed.count !== 1) return { message: "This sign-in link was already used. Request a new one." };
  await db.owner.update({ where: { id: row.ownerId }, data: { lastLoginAt: new Date() } });
  await setOwnerSession(row.ownerId, row.owner.sessionVersion);
  redirect("/owner");
}
export async function logoutOwner() { await clearOwnerSession(); redirect("/owner/login"); }
export async function logoutEverywhere() {
  const o = await requireOwner();
  await db.owner.update({ where: { id: o.id }, data: { sessionVersion: { increment: 1 } } });
  await clearOwnerSession();
  redirect("/owner/login");
}

// ---------- profile ----------
const profileSchema = z.object({
  summary: z.string().trim().min(10, "Summary must be at least 10 characters").max(160, "Summary is over 160 characters"),
  description: z.string().trim().min(60, "Write at least 60 characters about the business").max(3000, "Description is over 3000 characters"),
  phone: z.string().trim().regex(/^([+\d][\d\s()-]{6,19})?$/, "Enter a valid phone number").optional(),
  email: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),
  address: z.string().trim().max(200).optional(), postcode: z.string().trim().max(10).optional(),
  areasServed: z.string().trim().max(300).optional(), services: z.string().trim().max(600).optional(),
  founded: z.string().trim().regex(/^(1[89]\d\d|20\d\d)?$/, "Enter a four-digit year").optional(),
});
const urlFields = ["website", "instagram", "facebook", "linkedin", "imageUrl"] as const;
const LABEL: Record<string, string> = { website: "Website", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", imageUrl: "Image" };

export async function saveProfile(_: OState, fd: FormData): Promise<OState> {
  const { owner, business } = await requireBusiness(s(fd, "id")); // authorisation: must own THIS business
  const p = profileSchema.safeParse(Object.fromEntries(fd));
  const errors: Record<string, string> = p.success ? {} : errs(p.error);
  const urls: Record<string, string | null> = {};
  for (const k of urlFields) { const v = s(fd, k); if (!v) urls[k] = null; else { const u = safeUrl(v); if (!u) errors[k] = `${LABEL[k]} must be a valid http(s) web address`; else urls[k] = u; } }
  let hours: string | null = business.openingHours;
  try { const r = normaliseHours(JSON.parse(s(fd, "hours") || "{}")); if (r.ok) hours = r.json; else errors.hours = r.error; } catch { errors.hours = "Opening hours are invalid"; }
  if (Object.keys(errors).length || !p.success) return { errors, message: "Please fix the highlighted fields." };

  const d = p.data;
  const services = d.services ? JSON.stringify(d.services.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30)) : null;
  const next = {
    summary: d.summary, description: d.description, phone: d.phone || null, email: d.email || null, address: d.address || null, postcode: d.postcode || null,
    areasServed: d.areasServed || null, services, founded: d.founded ? Number(d.founded) : null, openingHours: hours,
    website: urls.website, instagram: urls.instagram, facebook: urls.facebook, linkedin: urls.linkedin, imageUrl: urls.imageUrl,
  };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(next)) { const from = (business as Record<string, unknown>)[k] ?? null; if (from !== to) changes[k] = { from, to }; }
  if (!Object.keys(changes).length) return { ok: true, message: "No changes to save." };

  await db.$transaction([
    db.business.update({ where: { id: business.id }, data: { ...next, websiteHost: websiteHost(next.website), ownerUpdatedAt: new Date() } }),
    db.businessEditLog.create({ data: { businessId: business.id, ownerId: owner.id, changes: JSON.stringify(changes) } }),
  ]);
  if ("postcode" in changes) await refreshGeo(business.id).catch(() => {});
  revalidatePath("/", "layout");
  return { ok: true, message: `Saved ${Object.keys(changes).length} change${Object.keys(changes).length > 1 ? "s" : ""}. Your profile is updated.` };
}

export async function requestChange(_: OState, fd: FormData): Promise<OState> {
  const { owner, business } = await requireBusiness(s(fd, "id"));
  const message = s(fd, "message");
  if (message.length < 10 || message.length > 1000) return { errors: { message: "Describe the change in 10–1000 characters" } };
  const recent = await db.profileChangeRequest.count({ where: { ownerId: owner.id, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  if (recent >= 5) return { message: "You've sent several requests today. We'll get to them." };
  await db.profileChangeRequest.create({ data: { businessId: business.id, ownerId: owner.id, message } });
  return { ok: true, message: "Request sent. We'll update the profile and email you." };
}

export async function submitCoverage(_: OState, fd: FormData): Promise<OState> {
  const { owner, business } = await requireBusiness(s(fd, "id"));
  const topic = s(fd, "topic"), details = s(fd, "details");
  const errors: Record<string, string> = {};
  if (topic.length < 5 || topic.length > 120) errors.topic = "Give your story a short headline (5–120 characters)";
  if (details.length < 30 || details.length > 2000) errors.details = "Tell us more (30–2000 characters)";
  if (Object.keys(errors).length) return { errors };
  if ((await db.coverageRequest.count({ where: { ownerId: owner.id, createdAt: { gte: new Date(Date.now() - 86400_000) } } })) >= 3) return { message: "You've sent several pitches today. Try again tomorrow." };
  await db.coverageRequest.create({ data: { businessId: business.id, ownerId: owner.id, topic, details } });
  return { ok: true, message: "Thanks! Our editors read every pitch. We can't promise coverage, and coverage is never for sale." };
}

// ---------- reviews ----------
async function ownedReview(reviewId: string) {
  const r = await db.review.findUnique({ where: { id: reviewId } });
  if (!r) return null;
  const { owner, business } = await requireBusiness(r.businessId); // authorisation via the review's business
  return { r, owner, business };
}
export async function respondToReviewAsOwner(_: OState, fd: FormData): Promise<OState> {
  const ctx = await ownedReview(s(fd, "reviewId"));
  if (!ctx) return { message: "Review not found." };
  if (ctx.r.status !== "PUBLISHED") return { message: "You can only respond to published reviews." };
  const response = s(fd, "response");
  if (response.length < 10 || response.length > 1500) return { message: "A response must be 10–1500 characters." };
  await db.review.update({ where: { id: ctx.r.id }, data: { response, respondedAt: new Date() } });
  await db.auditLog.create({ data: { action: "OWNER_REVIEW_RESPONSE", targetType: "Review", targetId: ctx.r.id, detail: ctx.owner.email } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Response published." };
}
export async function removeOwnerResponse(_: OState, fd: FormData): Promise<OState> {
  const ctx = await ownedReview(s(fd, "reviewId"));
  if (!ctx) return { message: "Review not found." };
  await db.review.update({ where: { id: ctx.r.id }, data: { response: null, respondedAt: null } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Response removed." };
}
export async function reportReviewAsOwner(_: OState, fd: FormData): Promise<OState> {
  const ctx = await ownedReview(s(fd, "reviewId"));
  if (!ctx) return { message: "Review not found." };
  const reason = s(fd, "reason"), details = s(fd, "details").slice(0, 500);
  if (!(reason in REPORT_REASONS)) return { message: "Choose a reason." };
  if (ctx.r.status !== "PUBLISHED") return { message: "That review isn't published." };
  const key = `owner:${ctx.owner.id}`;
  if (await db.reviewReport.findUnique({ where: { reviewId_reporterKey: { reviewId: ctx.r.id, reporterKey: key } } })) return { ok: true, message: "You've already reported this review." };
  await db.reviewReport.create({ data: { reviewId: ctx.r.id, reason, details: details || null, reporterKey: key, reporterType: "OWNER" } });
  return { ok: true, message: "Reported. A moderator will review it; the review stays visible meanwhile." };
}
