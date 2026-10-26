"use server";

import { redirect } from "next/navigation";
import { ipHash } from "@/lib/antispam";
import { audit } from "@/lib/audit";
import { clearSession, emailOk, legacyLoginAllowed, passwordOk, requireAdmin, requirePermission, setSession } from "@/lib/auth";
import {
  consumeRecoveryCode, createAdmin, isRole, issueSetupToken, makeRecoveryCodes,
  revokeSessions, setPasswordFromToken, signIn, recordSignedIn, type Role,
} from "@/lib/admin-users";
import { decryptField, encryptField, encryptionReady } from "@/lib/secretbox";
import { generateSecret, verifyTotp } from "@/lib/totp";
import { db } from "@/lib/db";
import { sendMail, siteLink } from "@/lib/mail";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();

export type AdminAuthState = { error?: string; needsTotp?: boolean; email?: string; ok?: boolean; message?: string };

/**
 * Sign in with an individual account.
 *
 * Password first, second factor second, and nothing is put in the cookie until both have passed. Carrying a
 * half-authenticated session would mean a valid cookie before the second factor, which defeats the point.
 */
export async function adminSignIn(_: AdminAuthState, fd: FormData): Promise<AdminAuthState> {
  const email = s(fd, "email").trim().toLowerCase();
  const password = s(fd, "password");
  const code = s(fd, "code").trim();
  const ip = await ipHash();

  const result = await signIn(email, password, ip);

  if (!result.ok) {
    // The migration path: while no individual account can sign in, the original shared password still
    // works. Without this, deploying individual accounts would lock the only existing administrator out of
    // their own site. It closes by itself the moment a real account has a password.
    if (await legacyLoginAllowed()) {
      const okEmail = emailOk(email), okPass = passwordOk(password); // both always evaluated: no timing tell
      if (okEmail && okPass) {
        await setSession();
        redirect("/admin");
      }
    }
    return { error: result.message, email };
  }

  if (result.needsTotp) {
    if (!code) return { needsTotp: true, email, error: undefined };
    const row = await db.adminUser.findUnique({ where: { id: result.admin.id }, select: { totpSecretEnc: true } });
    const secret = decryptField(row?.totpSecretEnc ?? null);
    const viaCode = secret ? verifyTotp(secret, code) : false;
    // A recovery code is accepted in place of an authenticator code, and is spent when used.
    const viaRecovery = viaCode ? false : await consumeRecoveryCode(result.admin.id, code);
    if (!viaCode && !viaRecovery) {
      await db.adminLoginAttempt.create({ data: { emailHash: "", ipHash: ip, ok: false, reason: "bad second factor" } }).catch(() => {});
      return { needsTotp: true, email, error: "That code is not right. Check your authenticator, or use a recovery code." };
    }
    if (viaRecovery) {
      await audit({ action: "Admin signed in with a recovery code", targetType: "AdminUser", targetId: result.admin.id, detail: result.admin.email },
        { kind: result.admin.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN", id: result.admin.id, email: result.admin.email });
    }
  }

  await setSession({ id: result.admin.id, role: result.admin.role, sessionVersion: result.sessionVersion });
  await recordSignedIn(result.admin.id);
  redirect("/admin");
}

export async function adminSignOut() {
  await clearSession();
  redirect("/admin/login");
}

/** Signs this administrator out of every device. */
export async function adminSignOutEverywhere() {
  const session = await requireAdmin();
  if (session.kind === "USER") {
    await revokeSessions(session.admin.id);
    await audit({ action: "Admin revoked their own sessions", targetType: "AdminUser", targetId: session.admin.id, detail: session.admin.email });
  }
  await clearSession();
  redirect("/admin/login");
}

// ---------------------------------------------------------------- setting a password from a link

export async function adminSetPassword(_: AdminAuthState, fd: FormData): Promise<AdminAuthState> {
  const token = s(fd, "token");
  const result = await setPasswordFromToken(token, s(fd, "password"), s(fd, "confirm"));
  if ("error" in result) return { error: result.error };
  await audit({ action: "Admin set their password", targetType: "AdminUser", targetId: result.admin.id, detail: result.admin.email },
    { kind: result.admin.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN", id: result.admin.id, email: result.admin.email });
  redirect("/admin/login?set=1");
}

// ---------------------------------------------------------------- managing administrators

export async function addAdmin(fd: FormData) {
  const session = await requirePermission("admins.manage");
  const back = (m: string): never => redirect(`/admin/admins?msg=${encodeURIComponent(m)}`);

  const role = s(fd, "role");
  if (!isRole(role)) back("Choose a role.");
  const created = await createAdmin({
    email: s(fd, "email"), name: s(fd, "name"), role: role as Role,
    createdBy: session.kind === "USER" ? session.admin.email : "shared-password session",
  });
  if (created.error || !created.admin) back(created.error ?? "Could not create that administrator.");
  const made = created.admin!, token = created.token!;

  const link = siteLink(`/admin/setup/${token}`);
  // The password is never chosen here and the link is never logged: it goes to the person, once.
  await sendMail(
    made.email,
    "Your PrimeStreet administrator account",
    [
      `${made.name},`,
      "",
      `An administrator account has been created for you on PrimeStreet, with the role: ${role}.`,
      "",
      "Set your password using the link below. It works once and expires in 48 hours.",
      link,
      "",
      "If you were not expecting this, tell us immediately — somebody has created an account in your name.",
    ].join("\n"),
    { purpose: "accounts" },
  );

  await audit({ action: "Administrator created", targetType: "AdminUser", targetId: made.id, detail: `${made.email} as ${role}` });
  back(`Created ${made.email}. A setup link has been emailed to them.`);
}

export async function resendAdminSetup(fd: FormData) {
  await requirePermission("admins.manage");
  const back = (m: string): never => redirect(`/admin/admins?msg=${encodeURIComponent(m)}`);
  const id = s(fd, "id");
  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) back("That administrator no longer exists.");

  const token = await issueSetupToken(id);
  await sendMail(
    target!.email,
    "Set your PrimeStreet administrator password",
    [`${target!.name},`, "", "Use the link below to set a new password. It works once and expires in 48 hours.", siteLink(`/admin/setup/${token}`), "",
     "If you did not ask for this, tell us — somebody else requested it."].join("\n"),
    { purpose: "accounts" },
  );
  await audit({ action: "Administrator setup link reissued", targetType: "AdminUser", targetId: id, detail: target!.email });
  back(`A new setup link has been emailed to ${target!.email}.`);
}

export async function setAdminRole(fd: FormData) {
  const session = await requirePermission("admins.manage");
  const back = (m: string): never => redirect(`/admin/admins?msg=${encodeURIComponent(m)}`);
  const id = s(fd, "id"), role = s(fd, "role");
  if (!isRole(role)) back("Unknown role.");

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) back("That administrator no longer exists.");

  // You cannot demote yourself out of the ability to put it back.
  if (session.kind === "USER" && session.admin.id === id && role !== "SUPER_ADMIN") {
    back("You cannot remove your own super admin role. Ask another super admin to do it.");
  }
  if (target!.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const others = await db.adminUser.count({ where: { role: "SUPER_ADMIN", active: true, id: { not: id } } });
    if (others === 0) back("That is the only super admin. Promote someone else first, or the site would be left with nobody who can manage access.");
  }

  await db.adminUser.update({ where: { id }, data: { role } });
  await audit({ action: "Administrator role changed", targetType: "AdminUser", targetId: id, detail: `${target!.email}: ${target!.role} to ${role}` });
  back(`${target!.email} is now ${role}.`);
}

export async function setAdminActive(fd: FormData) {
  const session = await requirePermission("admins.manage");
  const back = (m: string): never => redirect(`/admin/admins?msg=${encodeURIComponent(m)}`);
  const id = s(fd, "id"), active = s(fd, "active") === "1";

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) back("That administrator no longer exists.");
  if (session.kind === "USER" && session.admin.id === id && !active) back("You cannot deactivate yourself.");
  if (!active && target!.role === "SUPER_ADMIN") {
    const others = await db.adminUser.count({ where: { role: "SUPER_ADMIN", active: true, id: { not: id } } });
    if (others === 0) back("That is the only active super admin. Nobody would be able to manage access.");
  }

  await db.adminUser.update({ where: { id }, data: { active } });
  // Deactivating must take effect now, not when their cookie happens to expire.
  if (!active) await revokeSessions(id);
  await audit({ action: active ? "Administrator reactivated" : "Administrator deactivated", targetType: "AdminUser", targetId: id, detail: target!.email });
  back(`${target!.email} is ${active ? "active again" : "deactivated, and signed out everywhere"}.`);
}

// ---------------------------------------------------------------- second factor

export async function startTotp(): Promise<void> {
  const session = await requireAdmin();
  if (session.kind !== "USER") redirect("/admin/account?msg=" + encodeURIComponent("Sign in with your own account first."));
  if (!encryptionReady()) redirect("/admin/account?msg=" + encodeURIComponent("Two-factor cannot be set up: the encryption key is not configured."));
  const secret = generateSecret();
  // Stored encrypted and unconfirmed: it does nothing until a correct code proves the app has it too.
  await db.adminUser.update({ where: { id: session.admin.id }, data: { totpSecretEnc: encryptField(secret), totpConfirmedAt: null } });
  redirect("/admin/account?totp=new");
}

export async function confirmTotp(fd: FormData) {
  const session = await requireAdmin();
  const back = (m: string): never => redirect(`/admin/account?msg=${encodeURIComponent(m)}`);
  if (session.kind !== "USER") back("Sign in with your own account first.");
  const me = session.admin!;

  const row = await db.adminUser.findUnique({ where: { id: me.id }, select: { totpSecretEnc: true } });
  const secret = decryptField(row?.totpSecretEnc ?? null);
  if (!secret) back("Start again — there is no pending second factor to confirm.");
  if (!verifyTotp(secret!, s(fd, "code"))) back("That code is not right. Check the time on your phone and try the next one.");

  const { codes, hashes } = makeRecoveryCodes();
  await db.adminUser.update({ where: { id: me.id }, data: { totpConfirmedAt: new Date(), recoveryCodeHashes: hashes } });
  await audit({ action: "Admin enabled two-factor authentication", targetType: "AdminUser", targetId: me.id, detail: me.email });
  // Shown once, in the redirect, and never stored in readable form.
  redirect(`/admin/account?recovery=${encodeURIComponent(codes.join(","))}`);
}

export async function disableTotp(fd: FormData) {
  const session = await requireAdmin();
  const back = (m: string): never => redirect(`/admin/account?msg=${encodeURIComponent(m)}`);
  if (session.kind !== "USER") back("Sign in with your own account first.");
  const me = session.admin!;

  // Turning it off requires a current code: otherwise a stolen session could remove the protection.
  const row = await db.adminUser.findUnique({ where: { id: me.id }, select: { totpSecretEnc: true, totpConfirmedAt: true } });
  const secret = decryptField(row?.totpSecretEnc ?? null);
  if (row?.totpConfirmedAt && secret && !verifyTotp(secret, s(fd, "code"))) {
    back("Enter a current code from your authenticator to turn two-factor off.");
  }
  await db.adminUser.update({ where: { id: me.id }, data: { totpSecretEnc: null, totpConfirmedAt: null, recoveryCodeHashes: null } });
  await audit({ action: "Admin disabled two-factor authentication", targetType: "AdminUser", targetId: me.id, detail: me.email });
  back("Two-factor authentication is off.");
}
