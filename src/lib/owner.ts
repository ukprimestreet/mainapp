import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { newToken, sha256 } from "./antispam";
import { db } from "./db";
import { sendMail, siteLink } from "./mail";

/**
 * Owner accounts: passwordless. A short-lived, single-use, emailed link signs the owner in; a signed httpOnly cookie
 * carries the session. Signed with a different purpose prefix from the admin cookie, so one can never be replayed as the other.
 */
const COOKIE = "ps_owner";
const TTL_MS = 14 * 86400_000;
export const LOGIN_LINK_MS = 20 * 60_000;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET (32+ chars) is not configured");
  return s;
};
const sign = (payload: string) => createHmac("sha256", secret()).update(`owner:${payload}`).digest("base64url");

export function makeOwnerToken(ownerId: string, version: number, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ o: ownerId, v: version, exp: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readOwnerToken(token: string | undefined, now = Date.now()): { o: string; v: number } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString());
    return j.exp > now && typeof j.o === "string" ? { o: j.o, v: j.v } : null;
  } catch { return null; }
}

export async function getOwner() {
  const t = readOwnerToken((await cookies()).get(COOKIE)?.value);
  if (!t) return null;
  const owner = await db.owner.findUnique({ where: { id: t.o } });
  return owner && owner.sessionVersion === t.v ? owner : null; // bumping sessionVersion signs out everywhere
}
export async function requireOwner() {
  const o = await getOwner();
  if (!o) redirect("/owner/login");
  return o;
}
export async function setOwnerSession(ownerId: string, version: number) {
  (await cookies()).set(COOKIE, makeOwnerToken(ownerId, version), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000 });
}
export async function clearOwnerSession() { (await cookies()).delete(COOKIE); }

/** THE authorisation check: every owner page and action must pass through this with the business id. */
export async function ownsBusiness(ownerId: string, businessId: string) {
  return (await db.businessOwner.findUnique({ where: { ownerId_businessId: { ownerId, businessId } } })) !== null;
}
export async function requireBusiness(businessId: string) {
  const owner = await requireOwner();
  if (!(await ownsBusiness(owner.id, businessId))) notFound(); // 404, not 403: don't reveal that the business exists
  const business = await db.business.findUnique({ where: { id: businessId }, include: { category: true, location: true, city: true } });
  if (!business) notFound();
  return { owner, business };
}

export async function issueLoginLink(ownerId: string, email: string, ipHash: string) {
  const token = newToken();
  await db.ownerLoginToken.create({ data: { ownerId, tokenHash: sha256(token), ipHash, expiresAt: new Date(Date.now() + LOGIN_LINK_MS) } });
  await sendMail(email, "Your PrimeStreet sign-in link", `Use this link to sign in to your PrimeStreet owner dashboard (valid for 20 minutes, one use):\n\n${siteLink(`/owner/login/${token}`)}\n\nIf you didn't ask for this, ignore this email — nobody can sign in without it.`);
}

export async function loginTokenState(token: string): Promise<"ok" | "expired" | "used" | "invalid"> {
  const row = await db.ownerLoginToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row) return "invalid";
  if (row.usedAt) return "used";
  return row.expiresAt.getTime() < Date.now() ? "expired" : "ok";
}

/** Grants owner access after an admin approves a claim. Creates the owner account if needed. */
export async function grantOwnership(claim: { id: string; businessId: string; email: string; name: string }) {
  const email = claim.email.trim().toLowerCase();
  const owner = (await db.owner.findUnique({ where: { email } })) ?? (await db.owner.create({ data: { email, name: claim.name } }));
  await db.businessOwner.upsert({ where: { ownerId_businessId: { ownerId: owner.id, businessId: claim.businessId } }, create: { ownerId: owner.id, businessId: claim.businessId, claimId: claim.id }, update: {} });
  return owner;
}

// ---- profile helpers
export const HOURS_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const T = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Validates & normalises an opening-hours object: { mon: "09:00-17:30", ... } (missing day = closed). */
export function normaliseHours(input: unknown): { ok: true; json: string | null } | { ok: false; error: string } {
  if (Array.isArray(input)) return { ok: false, error: "Opening hours are invalid" };
  if (input == null || (typeof input === "object" && !Object.keys(input as object).length)) return { ok: true, json: null };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Opening hours are invalid" };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!(HOURS_KEYS as readonly string[]).includes(k)) return { ok: false, error: `Unknown day "${k}"` };
    if (typeof v !== "string") return { ok: false, error: "Opening hours are invalid" };
    const m = v.match(/^(\d\d:\d\d)-(\d\d:\d\d)$/);
    if (!m || !T.test(m[1]) || !T.test(m[2])) return { ok: false, error: `${k}: use HH:MM-HH:MM` };
    if (m[1] >= m[2]) return { ok: false, error: `${k}: closing time must be after opening time` };
    out[k] = v;
  }
  return { ok: true, json: JSON.stringify(out) };
}

export type CompletenessInput = { summary: string; description: string; phone: string | null; website: string | null; address: string | null; postcode: string | null; openingHours: string | null; services: string | null; imageUrl: string | null; instagram: string | null; facebook: string | null; linkedin: string | null };
/** Completeness checklist shown to owners (what to add next), not a ranking factor. */
export function completeness(b: CompletenessInput) {
  const items: [string, boolean][] = [
    ["A clear one-line summary", b.summary.length >= 30],
    ["A description of 150+ characters", b.description.length >= 150],
    ["Phone number", !!b.phone],
    ["Website", !!b.website],
    ["Street address and postcode", !!b.address && !!b.postcode],
    ["Opening hours", !!b.openingHours && b.openingHours !== "{}"],
    ["At least 3 services", (() => { try { return (JSON.parse(b.services ?? "[]") as string[]).length >= 3; } catch { return false; } })()],
    ["A photo", !!b.imageUrl],
    ["A social link", !!(b.instagram || b.facebook || b.linkedin)],
  ];
  const done = items.filter(([, ok]) => ok).length;
  return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python|axios|node-fetch|go-http/i;
export const isBotUA = (ua: string | null | undefined) => !ua || BOT.test(ua);
export const today = () => new Date().toISOString().slice(0, 10);
export async function countView(businessId: string, ua: string | null) {
  if (isBotUA(ua)) return;
  const day = today();
  await db.businessStat.upsert({ where: { businessId_day: { businessId, day } }, create: { businessId, day, views: 1 }, update: { views: { increment: 1 } } }).catch(() => {});
}
export async function views30(businessId: string) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const r = await db.businessStat.aggregate({ where: { businessId, day: { gte: since } }, _sum: { views: true } });
  return r._sum.views ?? 0;
}

/** What the evidence on a claim supports. Used both to render the admin UI and to ENFORCE approval rules server-side. */
export function claimEvidence(c: { emailVerifiedAt: Date | null; domainMatch: boolean; phoneVerifiedAt: Date | null }) {
  const canApprove = !!c.emailVerifiedAt; // we must be able to reach the person, and they must control the inbox
  const canVerify = canApprove && (c.domainMatch || !!c.phoneVerifiedAt); // strong proof: business-domain email OR phone call-back
  return { canApprove, canVerify };
}

