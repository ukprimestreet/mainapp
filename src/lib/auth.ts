import { createHmac, createHash, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Admin auth foundation (single shared admin password + signed, expiring, httpOnly cookie).
 * Deliberately simple for Phase 2; Phase 5 adds per-user accounts for business owners.
 */
const COOKIE = "ps_admin";
const TTL_MS = 8 * 3600_000;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET (32+ chars) is not configured");
  return s;
};
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");
const digest = (s: string) => createHash("sha256").update(s).digest();

export const adminConfigured = () => !!process.env.ADMIN_PASSWORD && !!process.env.ADMIN_EMAIL && (process.env.SESSION_SECRET?.length ?? 0) >= 32;

export function makeToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !adminConfigured()) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > now; } catch { return false; }
}
export function emailOk(input: string) {
  const real = process.env.ADMIN_EMAIL;
  return !!real && timingSafeEqual(digest(input.trim().toLowerCase()), digest(real.trim().toLowerCase()));
}
export function passwordOk(input: string) {
  const real = process.env.ADMIN_PASSWORD;
  return !!real && timingSafeEqual(digest(input), digest(real));
}

// naive in-memory brute-force throttle: 5 failures / 15 min per client (good enough for one instance)
const fails = new Map<string, { n: number; until: number }>();
export function throttled(key: string, now = Date.now()) { const f = fails.get(key); return !!f && f.n >= 5 && f.until > now; }
export function recordFail(key: string, now = Date.now()) {
  const f = fails.get(key);
  fails.set(key, !f || f.until < now ? { n: 1, until: now + 15 * 60_000 } : { n: f.n + 1, until: f.until });
}
export const clearFails = (key: string) => fails.delete(key);
export async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

export async function setSession() {
  (await cookies()).set(COOKIE, makeToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000 });
}
export async function clearSession() { (await cookies()).delete(COOKIE); }
export async function isAdmin() { return verifyToken((await cookies()).get(COOKIE)?.value); }
/** Call at the top of every admin page AND every admin server action. */
export async function requireAdmin() { if (!(await isAdmin())) redirect("/admin/login"); }
