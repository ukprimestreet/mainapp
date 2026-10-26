import { createHmac, createHash, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { can, hasAdminUsers, type AdminIdentity, type Permission, type Role } from "./admin-users";

/**
 * Admin authentication.
 *
 * Two routes in, for as long as the migration lasts:
 *
 *   1. An individual `AdminUser` account. The session carries the administrator's id, role and session
 *      version, so an audit entry can name who acted and bumping the version signs them out everywhere.
 *   2. The original single shared `ADMIN_PASSWORD`. **Only accepted while no individual account can log in**
 *      — the moment a real account exists with a password, this route closes by itself. That makes the
 *      migration finish without anyone having to remember to turn the old door off, and it cannot lock
 *      anybody out, because the old door stays open until the new one works.
 *
 * `ADMIN_LEGACY_LOGIN=allow` forces the old route back open. It exists for the case where the first account
 * is created and then nobody can reach it; it is a deliberate, visible escape hatch, not a default.
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

export const adminConfigured = () => (process.env.SESSION_SECRET?.length ?? 0) >= 32;
export const legacyPasswordConfigured = () => !!process.env.ADMIN_PASSWORD && !!process.env.ADMIN_EMAIL;

/** Is the shared password still an acceptable way in? */
export async function legacyLoginAllowed(): Promise<boolean> {
  if (!legacyPasswordConfigured()) return false;
  if (process.env.ADMIN_LEGACY_LOGIN === "allow") return true;
  return !(await hasAdminUsers());
}

type Payload = { exp: number; a?: string; r?: string; v?: number };

export function makeToken(now = Date.now(), identity?: { id: string; role: string; sessionVersion: number }) {
  const body: Payload = identity
    ? { exp: now + TTL_MS, a: identity.id, r: identity.role, v: identity.sessionVersion }
    : { exp: now + TTL_MS };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Signature and expiry only. Says nothing about whether the account still exists — see `adminSession()`. */
export function readToken(token: string | undefined, now = Date.now()): Payload | null {
  if (!token || !adminConfigured()) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as Payload;
    return p.exp > now ? p : null;
  } catch { return null; }
}

/** Kept for the existing call sites, which only ask "is this an admin at all?". */
export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  return readToken(token, now) !== null;
}

export function emailOk(input: string) {
  const real = process.env.ADMIN_EMAIL;
  return !!real && timingSafeEqual(digest(input.trim().toLowerCase()), digest(real.trim().toLowerCase()));
}
export function passwordOk(input: string) {
  const real = process.env.ADMIN_PASSWORD;
  return !!real && timingSafeEqual(digest(input), digest(real));
}

// In-memory throttle, kept for the legacy route. Individual accounts use the durable one in admin-users.ts.
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

export async function setSession(identity?: { id: string; role: string; sessionVersion: number }) {
  (await cookies()).set(COOKIE, makeToken(Date.now(), identity), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000,
  });
}
export async function clearSession() { (await cookies()).delete(COOKIE); }

export type AdminSession =
  | { kind: "USER"; admin: AdminIdentity }
  /** The shared password: a valid admin with no identity, which is exactly why it is being replaced. */
  | { kind: "LEGACY"; admin: null };

/**
 * Who is signed in. Re-reads the account on every call so that deactivating an administrator, changing a
 * role or revoking sessions takes effect immediately rather than when their cookie happens to expire.
 */
export async function adminSession(): Promise<AdminSession | null> {
  const p = readToken((await cookies()).get(COOKIE)?.value);
  if (!p) return null;

  if (p.a) {
    const row = await db.adminUser.findUnique({ where: { id: p.a } });
    if (!row || !row.active) return null;
    if (row.sessionVersion !== p.v) return null; // revoked, or the password was changed
    return { kind: "USER", admin: { id: row.id, email: row.email, name: row.name, role: row.role as Role, active: row.active } };
  }

  // A legacy cookie is only honoured while the legacy route is still open; otherwise an old cookie would
  // outlive the door it came through.
  return (await legacyLoginAllowed()) ? { kind: "LEGACY", admin: null } : null;
}

export async function isAdmin() { return (await adminSession()) !== null; }

/** Call at the top of every admin page AND every admin server action. */
export async function requireAdmin() {
  const s = await adminSession();
  if (!s) redirect("/admin/login");
  return s;
}

/**
 * Require a specific capability.
 *
 * A legacy shared-password session passes everything: it is the pre-migration state, and refusing it would
 * lock the only existing administrator out of their own site. That is precisely why individual accounts
 * exist, and why the legacy route closes as soon as one works.
 */
export async function requirePermission(permission: Permission) {
  const s = await requireAdmin();
  if (s.kind === "LEGACY") return s;
  if (!can(s.admin.role, permission)) redirect(`/admin?denied=${encodeURIComponent(permission)}`);
  return s;
}

/** Non-redirecting check, for deciding what to render. Never the only control on an action. */
export async function adminCan(permission: Permission): Promise<boolean> {
  const s = await adminSession();
  if (!s) return false;
  return s.kind === "LEGACY" || can(s.admin.role, permission);
}
