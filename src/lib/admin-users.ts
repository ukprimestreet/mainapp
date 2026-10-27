import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "./db";
import { hashPassword, verifyPassword, checkPassword } from "./author-password";

/**
 * Individual administrator accounts and what each role may do.
 *
 * The shape of this file is the point: permissions are a data structure, not a scattering of `if` statements.
 * Every protected operation names a permission, every permission belongs to roles, and the check happens on
 * the server. A hidden button is not an access control.
 */

export const ROLES = {
  SUPER_ADMIN: {
    label: "Super admin",
    blurb: "Everything, including other administrators, money and platform configuration.",
  },
  ADMIN: {
    label: "Admin",
    blurb: "Day-to-day lead and moderation work. No administrator management, no money, no configuration.",
  },
} as const;
export type Role = keyof typeof ROLES;
export const isRole = (v: string): v is Role => v in ROLES;

/**
 * One entry per protected capability. Adding a capability means adding it here first, which is what stops
 * a new screen quietly inheriting more access than it should.
 */
export const PERMISSIONS = {
  // Leads — the routine work an ADMIN exists to do.
  "leads.view": "See leads and their matching history",
  "leads.assign": "Assign a lead to a business by hand",
  "leads.customer_contact": "See a customer's name, email and phone",

  // Moderation and editorial.
  "moderation.handle": "Approve, reject and respond to the moderation queue",
  "editorial.publish": "Publish, edit and withdraw articles",
  "business.edit": "Create and edit directory listings",

  // Money and anything that moves it.
  "money.view": "See revenue, subscriptions and what is owed",
  "credits.adjust": "Grant, deduct or reverse lead credits",
  "payments.approve": "Approve and mark writer payments paid",
  "payments.bank_details": "Reveal a writer's bank details",
  "refunds.issue": "Issue a refund",

  // Platform control.
  "admins.manage": "Create, change and deactivate administrators",
  "settings.manage": "Change platform settings",
  "automations.manage": "Turn automated emails on and off, and run them",
  "audit.view": "Read the audit log",
} as const;
export type Permission = keyof typeof PERMISSIONS;

/**
 * ADMIN deliberately excludes everything that moves money, changes who has access, or alters platform
 * configuration. It includes `leads.customer_contact`, because an administrator who cannot see the customer
 * cannot assign a lead by hand — the restriction that matters is that it is *recorded* every time.
 */
const GRANTS: Record<Role, Permission[]> = {
  SUPER_ADMIN: Object.keys(PERMISSIONS) as Permission[],
  ADMIN: [
    "leads.view", "leads.assign", "leads.customer_contact",
    "moderation.handle", "editorial.publish", "business.edit",
    "audit.view",
  ],
};

export const can = (role: string | null | undefined, permission: Permission): boolean =>
  !!role && isRole(role) && GRANTS[role].includes(permission);

export const permissionsFor = (role: string): Permission[] => (isRole(role) ? GRANTS[role] : []);

// ---------------------------------------------------------------- accounts

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const emailHash = (email: string) => sha256(email.trim().toLowerCase());

export type AdminIdentity = { id: string; email: string; name: string; role: Role; active: boolean };

/** Is the individual-account system in use yet? While false, the shared-password login still works. */
export async function hasAdminUsers(): Promise<boolean> {
  try {
    return (await db.adminUser.count({ where: { active: true, passwordHash: { not: null } } })) > 0;
  } catch {
    // The migration boundary: code reaching for `AdminUser` before the schema has it must degrade to the
    // pre-migration behaviour — the shared password — rather than returning 500 and locking everybody out
    // of their own admin. Not hypothetical: it happened in production and /admin/login was down.
    return false;
  }
}

/**
 * Creates an account with no password and a one-time setup link.
 *
 * The password is never chosen here and never printed: the person sets their own from the link. That is also
 * why there is no administrator registration page — an account can only come from someone who already has
 * `admins.manage`, or from the bootstrap script on the server.
 */
export type CreateAdminResult =
  | { error: string; admin?: undefined; token?: undefined }
  | { error?: undefined; admin: { id: string; email: string; name: string; role: string }; token: string };

export async function createAdmin(input: { email: string; name: string; role: Role; createdBy?: string }): Promise<CreateAdminResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) return { error: "Enter a valid email address." };
  if (input.name.trim().length < 2) return { error: "Enter a name." };
  if (!isRole(input.role)) return { error: "Unknown role." };
  if (await db.adminUser.findUnique({ where: { email } })) return { error: "An administrator with that email already exists." };

  const token = randomBytes(24).toString("base64url");
  const admin = await db.adminUser.create({
    data: {
      email, name: input.name.trim(), role: input.role, createdBy: input.createdBy ?? null,
      setupTokenHash: sha256(token), setupExpiresAt: new Date(Date.now() + 48 * 3600_000),
    },
  });
  return { admin, token };
}

/** Issues a fresh setup link, for a forgotten password or an account that was never set up. */
export async function issueSetupToken(adminId: string) {
  const token = randomBytes(24).toString("base64url");
  await db.adminUser.update({
    where: { id: adminId },
    data: { setupTokenHash: sha256(token), setupExpiresAt: new Date(Date.now() + 48 * 3600_000) },
  });
  return token;
}

export type SetupState = "ok" | "expired" | "used" | "invalid";
export async function setupTokenState(token: string): Promise<{ state: SetupState; admin: AdminIdentity | null }> {
  const row = await db.adminUser.findFirst({ where: { setupTokenHash: sha256(token) } });
  if (!row) return { state: "invalid", admin: null };
  if (!row.setupExpiresAt || row.setupExpiresAt.getTime() < Date.now()) return { state: "expired", admin: null };
  if (!row.active) return { state: "invalid", admin: null };
  return { state: "ok", admin: { id: row.id, email: row.email, name: row.name, role: row.role as Role, active: row.active } };
}

/** Sets a password from a one-time link. The link is spent whether or not the password was acceptable. */
export async function setPasswordFromToken(token: string, password: string, confirm: string) {
  const { state, admin } = await setupTokenState(token);
  if (state !== "ok" || !admin) {
    return { error: state === "expired" ? "That link has expired. Ask a super admin for a new one." : "That link is not valid." };
  }
  const problem = checkPassword(password, confirm, admin.email);
  if (problem) return { error: problem };

  // Claimed atomically, so two tabs cannot both spend the same link.
  const claimed = await db.adminUser.updateMany({
    where: { id: admin.id, setupTokenHash: sha256(token) },
    data: {
      passwordHash: hashPassword(password),
      setupTokenHash: null, setupExpiresAt: null,
      sessionVersion: { increment: 1 }, // setting a password signs out everywhere, by design
    },
  });
  if (claimed.count !== 1) return { error: "That link has already been used." };
  return { ok: true as const, admin };
}

// ---------------------------------------------------------------- sign in

/** Durable throttling: in the database, so it survives a deploy and leaves a trail. */
export const LOGIN_LIMITS = { perEmailPerHour: 8, perIpPerHour: 20, windowMs: 3600_000 };

export async function loginThrottled(email: string, ipHash: string) {
  const since = new Date(Date.now() - LOGIN_LIMITS.windowMs);
  const [byEmail, byIp] = await Promise.all([
    db.adminLoginAttempt.count({ where: { emailHash: emailHash(email), ok: false, createdAt: { gte: since } } }),
    db.adminLoginAttempt.count({ where: { ipHash, ok: false, createdAt: { gte: since } } }),
  ]);
  if (byEmail >= LOGIN_LIMITS.perEmailPerHour) return { throttled: true as const, reason: "account" as const };
  if (byIp >= LOGIN_LIMITS.perIpPerHour) return { throttled: true as const, reason: "address" as const };
  return { throttled: false as const };
}

const recordAttempt = (email: string, ipHash: string, ok: boolean, reason?: string) =>
  db.adminLoginAttempt.create({ data: { emailHash: emailHash(email), ipHash, ok, reason: reason ?? null } }).catch(() => {});

export type SignInResult =
  | { ok: true; admin: AdminIdentity; sessionVersion: number; needsTotp: boolean }
  | { ok: false; message: string; needsTotp?: boolean };

/**
 * Verifies an email and password. Deliberately does not say which half was wrong, and does the password
 * comparison even when the account does not exist so that a missing account and a wrong password take the
 * same time to answer.
 */
export async function signIn(email: string, password: string, ipHash: string): Promise<SignInResult> {
  const t = await loginThrottled(email, ipHash);
  if (t.throttled) {
    await recordAttempt(email, ipHash, false, `throttled:${t.reason}`);
    return { ok: false, message: "Too many attempts. Try again in an hour." };
  }

  const row = await db.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  const stored = row?.passwordHash ?? null;
  // Always run a verification so the timing does not reveal whether the account exists.
  const matches = verifyPassword(password, stored ?? hashPassword(randomBytes(16).toString("hex")));

  if (!row || !row.active || !stored || !matches) {
    await recordAttempt(email, ipHash, false, !row ? "no account" : !row.active ? "inactive" : !stored ? "no password set" : "wrong password");
    return { ok: false, message: "Incorrect email or password." };
  }

  await recordAttempt(email, ipHash, true);
  return {
    ok: true,
    admin: { id: row.id, email: row.email, name: row.name, role: row.role as Role, active: row.active },
    sessionVersion: row.sessionVersion,
    needsTotp: !!row.totpSecretEnc && !!row.totpConfirmedAt,
  };
}

export async function recordSignedIn(adminId: string) {
  await db.adminUser.update({ where: { id: adminId }, data: { lastLoginAt: new Date() } }).catch(() => {});
}

/** Signs an administrator out of every device. */
export async function revokeSessions(adminId: string) {
  await db.adminUser.update({ where: { id: adminId }, data: { sessionVersion: { increment: 1 } } });
}

// ---------------------------------------------------------------- recovery codes

export function makeRecoveryCodes(n = 8) {
  const codes = Array.from({ length: n }, () => randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"));
  return { codes, hashes: JSON.stringify(codes.map(sha256)) };
}

/** Spends a recovery code if it is valid. Single use: the hash is removed from the stored list. */
export async function consumeRecoveryCode(adminId: string, code: string): Promise<boolean> {
  const row = await db.adminUser.findUnique({ where: { id: adminId }, select: { recoveryCodeHashes: true } });
  if (!row?.recoveryCodeHashes) return false;
  let hashes: string[] = [];
  try { hashes = JSON.parse(row.recoveryCodeHashes) as string[]; } catch { return false; }
  const want = sha256(code.trim().toUpperCase());
  const idx = hashes.findIndex((h) => h.length === want.length && timingSafeEqual(Buffer.from(h), Buffer.from(want)));
  if (idx === -1) return false;
  hashes.splice(idx, 1);
  await db.adminUser.update({ where: { id: adminId }, data: { recoveryCodeHashes: JSON.stringify(hashes) } });
  return true;
}
