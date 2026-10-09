"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { newToken, sha256 } from "@/lib/antispam";
import { domainMatches } from "@/lib/business";
import { db } from "@/lib/db";
import { sendMail, siteLink } from "@/lib/mail";

export type ClaimState = { ok: boolean; errors?: Record<string, string>; message?: string; values?: Record<string, string> };
export type StatusState = { ok?: boolean; message?: string };

const schema = z.object({
  business: z.string().min(1, "Choose the business you want to claim"),
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  phone: z.string().trim().regex(/^[+\d][\d\s()-]{6,19}$/, "Enter a valid phone number"),
  role: z.string().trim().min(2, "Enter your role, e.g. Owner or Director").max(80),
  relationship: z.enum(["owner", "director", "manager", "authorised-rep"], { message: "Choose your relationship to the business" }),
  verification: z.string().trim().min(20, "Tell us how we can verify you (at least a sentence)").max(2000),
});

function fieldErrors(error: z.ZodError, fd: FormData): ClaimState {
  const errors: Record<string, string> = {};
  for (const i of error.issues) errors[String(i.path[0])] ??= i.message;
  return { ok: false, errors, values: Object.fromEntries([...fd].filter(([k]) => k !== "website_url").map(([k, v]) => [k, String(v)])) };
}

async function sendStatusLink(to: string, businessName: string, token: string, kind: "CLAIM" | "DISPUTE") {
  const link = siteLink(`/claim/status/${token}`);
  await sendMail(to, kind === "CLAIM" ? `Confirm your claim of ${businessName}` : `Your ownership report about ${businessName}`,
    kind === "CLAIM"
      ? `Thanks for claiming ${businessName} on PrimeStreet.\n\nConfirm your email address and follow your request's progress here:\n\n${link}\n\nWe review every claim by hand and may ask for more information. If you didn't make this request, ignore this email.`
      : `We've received your report about the ownership of ${businessName}. Follow it here:\n\n${link}`, { purpose: "claims" });
}

export async function submitClaim(_prev: ClaimState, fd: FormData): Promise<ClaimState> {
  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (String(fd.get("website_url") ?? "").length > 0) return { ok: true };

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fieldErrors(parsed.error, fd);
  const d = parsed.data;
  const business = await db.business.findUnique({ where: { slug: d.business } });
  if (!business) return { ok: false, errors: { business: "That business could not be found" } };
  if (business.claimStatus === "CLAIMED" || business.claimStatus === "VERIFIED")
    return { ok: false, errors: { business: "This business has already been claimed. If that isn't right, use 'Dispute this claim' on its profile." } };

  const recent = await db.claimRequest.count({ where: { email: d.email, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= 3) return { ok: false, message: "Too many requests from this email. Please try again later." };

  const token = newToken();
  const dup = await db.claimRequest.findFirst({ where: { businessId: business.id, email: d.email, kind: "CLAIM", status: { in: ["PENDING", "NEEDS_INFO"] } } });
  if (dup) {
    // Same response either way; re-send a fresh status link (old one stops working).
    await db.claimRequest.update({ where: { id: dup.id }, data: { tokenHash: sha256(token) } });
    await sendStatusLink(d.email, business.name, token, "CLAIM");
    return { ok: true, message: "We already have your request for this business. We've re-sent your status link." };
  }

  await db.$transaction([
    db.claimRequest.create({
      data: {
        businessId: business.id, name: d.name, email: d.email, phone: d.phone, role: d.role, relationship: d.relationship, verification: d.verification,
        tokenHash: sha256(token), domainMatch: domainMatches(d.email, business.websiteHost),
      },
    }),
    db.business.update({ where: { id: business.id }, data: { claimStatus: "PENDING" } }),
  ]);
  await sendStatusLink(d.email, business.name, token, "CLAIM");
  return { ok: true };
}

const disputeSchema = z.object({
  business: z.string().min(1),
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  role: z.string().trim().min(2, "Enter your role").max(80),
  verification: z.string().trim().min(30, "Explain why the current owner is wrong (at least a sentence or two)").max(2000),
});
/** Someone says a claimed profile is controlled by the wrong person. Goes to the admin queue; changes nothing until reviewed. */
export async function submitDispute(_prev: ClaimState, fd: FormData): Promise<ClaimState> {
  if (String(fd.get("website_url") ?? "").length > 0) return { ok: true };
  const p = disputeSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return fieldErrors(p.error, fd);
  const d = p.data;
  const business = await db.business.findUnique({ where: { slug: d.business } });
  if (!business || (business.claimStatus !== "CLAIMED" && business.claimStatus !== "VERIFIED")) return { ok: false, message: "Only claimed profiles can be disputed." };
  const recent = await db.claimRequest.count({ where: { email: d.email, kind: "DISPUTE", createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  if (recent >= 2) return { ok: false, message: "Too many reports from this email today." };
  const token = newToken();
  await db.claimRequest.create({ data: { kind: "DISPUTE", businessId: business.id, name: d.name, email: d.email, phone: "-", role: d.role, relationship: "other", verification: d.verification, tokenHash: sha256(token) } });
  await sendStatusLink(d.email, business.name, token, "DISPUTE");
  return { ok: true };
}

// ---- status page actions (token = proof of access to the claimant's inbox) ----
const byToken = (token: string) => db.claimRequest.findFirst({ where: { tokenHash: sha256(token) }, include: { business: true } });

/** POST (not GET) so email-scanner prefetching can't confirm an address by itself. */
export async function confirmClaimEmail(token: string): Promise<StatusState> {
  const c = await byToken(token);
  if (!c) return { message: "This link is no longer valid." };
  if (!c.emailVerifiedAt) await db.claimRequest.update({ where: { id: c.id }, data: { emailVerifiedAt: new Date() } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Email confirmed. Thank you." };
}

export async function submitPhoneCode(token: string, _: StatusState, fd: FormData): Promise<StatusState> {
  const c = await byToken(token);
  if (!c) return { message: "This link is no longer valid." };
  if (c.phoneVerifiedAt) return { ok: true, message: "Phone already verified." };
  if (!c.phoneCodeHash) return { message: "No code has been issued yet." };
  if (c.phoneCodeSetAt && Date.now() - c.phoneCodeSetAt.getTime() > 48 * 3600_000) return { message: "That code has expired. Ask us for a new one." };
  if (c.phoneAttempts >= 5) return { message: "Too many wrong attempts. Ask us for a new code." };
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (sha256(`${c.id}:${code}`) !== c.phoneCodeHash) {
    await db.claimRequest.update({ where: { id: c.id }, data: { phoneAttempts: { increment: 1 } } });
    return { message: "That code isn't right." };
  }
  await db.claimRequest.update({ where: { id: c.id }, data: { phoneVerifiedAt: new Date() } });
  return { ok: true, message: "Phone verified. Thank you." };
}

export async function addClaimInfo(token: string, _: StatusState, fd: FormData): Promise<StatusState> {
  const c = await byToken(token);
  if (!c) return { message: "This link is no longer valid." };
  if (c.status !== "PENDING" && c.status !== "NEEDS_INFO") return { message: "This request is closed." };
  const text = String(fd.get("info") ?? "").trim();
  if (text.length < 10 || text.length > 2000) return { message: "Please write 10–2000 characters." };
  await db.claimRequest.update({ where: { id: c.id }, data: { verification: `${c.verification}\n\n— Update ${new Date().toISOString().slice(0, 10)}:\n${text}`.slice(0, 6000), status: "PENDING" } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Thanks — we've added that to your request." };
}

export async function withdrawClaim(token: string): Promise<StatusState> {
  const c = await byToken(token);
  if (!c) return { message: "This link is no longer valid." };
  if (c.status !== "PENDING" && c.status !== "NEEDS_INFO") return { message: "This request is already closed." };
  await db.claimRequest.update({ where: { id: c.id }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
  if (c.kind === "CLAIM") {
    const others = await db.claimRequest.count({ where: { businessId: c.businessId, kind: "CLAIM", status: { in: ["PENDING", "NEEDS_INFO"] } } });
    if (!others && c.business.claimStatus === "PENDING") await db.business.update({ where: { id: c.businessId }, data: { claimStatus: "UNCLAIMED" } });
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Your request has been withdrawn." };
}
