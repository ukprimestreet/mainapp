// Individual administrator accounts: roles, permissions, sessions, second factor and audit attribution.
// Proves the five things decision D3 asked for proof of, against the dev schema.
import { PrismaClient } from "@prisma/client";
import {
  can, consumeRecoveryCode, createAdmin, LOGIN_LIMITS, loginThrottled, makeRecoveryCodes, PERMISSIONS,
  permissionsFor, revokeSessions, setPasswordFromToken, setupTokenState, signIn, type Permission,
} from "../src/lib/admin-users";
import { makeToken, readToken } from "../src/lib/auth";
import { audit } from "../src/lib/audit";
import { generateSecret, totpAt, verifyTotp, base32Decode, base32Encode, provisioningUri } from "../src/lib/totp";
import { randomBytes } from "crypto";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const MARK = "@admintest.local";
const IP = "admin-test-suite";

async function cleanup() {
  const ids = (await db.adminUser.findMany({ where: { email: { endsWith: MARK } }, select: { id: true } })).map((a) => a.id);
  if (ids.length) {
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { targetType: "AdminUser", targetId: { in: ids } } });
    await db.adminUser.deleteMany({ where: { id: { in: ids } } });
  }
  await db.adminLoginAttempt.deleteMany({ where: { ipHash: IP } });
}

async function main() {
  await cleanup();

  // ---------------- the permission matrix is the contract
  t("a super admin holds every permission", permissionsFor("SUPER_ADMIN").length === Object.keys(PERMISSIONS).length);
  t("an admin holds fewer", permissionsFor("ADMIN").length < Object.keys(PERMISSIONS).length);
  t("an unknown role holds none", permissionsFor("EDITOR").length === 0);

  const forbidden: Permission[] = ["admins.manage", "credits.adjust", "payments.approve", "payments.bank_details", "refunds.issue", "money.view", "settings.manage", "automations.manage"];
  for (const p of forbidden) {
    t(`an admin may NOT ${p}`, can("ADMIN", p) === false);
    t(`…while a super admin may`, can("SUPER_ADMIN", p) === true);
  }
  const allowed: Permission[] = ["leads.view", "leads.assign", "leads.customer_contact", "moderation.handle"];
  for (const p of allowed) t(`an admin may ${p}`, can("ADMIN", p) === true);
  t("nobody gets a permission that does not exist", can("SUPER_ADMIN", "leads.delete" as Permission) === false);
  t("a null role gets nothing", can(null, "leads.view") === false);

  // ---------------- creating an account, and setting a password from the link
  const email = `alice${MARK}`;
  const made = await createAdmin({ email, name: "Alice Admin", role: "ADMIN", createdBy: "test" });
  t("an account is created", !!made.admin && !made.error);
  t("…with no password, so the link is the only way in", (await db.adminUser.findUnique({ where: { email } }))?.passwordHash === null);
  t("…and a setup token that is only stored hashed", (await db.adminUser.findUnique({ where: { email } }))?.setupTokenHash !== made.token);

  const dupe = await createAdmin({ email, name: "Someone Else", role: "ADMIN" });
  t("the same email cannot be registered twice", !!dupe.error);
  t("an invalid email is refused", !!(await createAdmin({ email: "nope", name: "X", role: "ADMIN" })).error);
  t("a blank name is refused", !!(await createAdmin({ email: `b${MARK}`, name: "", role: "ADMIN" })).error);

  t("looking at a setup token does not spend it", (await setupTokenState(made.token!)).state === "ok");
  t("a wrong token is invalid, not an error", (await setupTokenState("wrong")).state === "invalid");

  t("a weak password is refused", !!(await setPasswordFromToken(made.token!, "short", "short")).error);
  t("a mismatch is refused", !!(await setPasswordFromToken(made.token!, "correct-horse-1", "correct-horse-2")).error);
  const set = await setPasswordFromToken(made.token!, "orbital-kettle-92", "orbital-kettle-92");
  t("a good password is accepted", "ok" in set && set.ok === true);
  t("…and the token is spent", (await setupTokenState(made.token!)).state === "invalid");
  t("…and cannot be reused", !!(await setPasswordFromToken(made.token!, "another-good-one-7", "another-good-one-7")).error);

  // ---------------- signing in
  const bad = await signIn(email, "wrong-password-here", IP);
  t("a wrong password is refused", !bad.ok);
  t("…and the message does not say which half was wrong", !bad.ok && /incorrect email or password/i.test(bad.message));
  const good = await signIn(email, "orbital-kettle-92", IP);
  t("the right password is accepted", good.ok);
  t("…and returns the role", good.ok && good.admin.role === "ADMIN");
  t("…with no second factor required yet", good.ok && good.needsTotp === false);

  const ghost = await signIn(`nobody${MARK}`, "orbital-kettle-92", IP);
  t("an account that does not exist gives the same answer", !ghost.ok && /incorrect email or password/i.test(ghost.message));

  await db.adminUser.update({ where: { email }, data: { active: false } });
  t("a deactivated account cannot sign in", !(await signIn(email, "orbital-kettle-92", IP)).ok);
  await db.adminUser.update({ where: { email }, data: { active: true } });

  // ---------------- throttling is durable, not in memory
  await db.adminLoginAttempt.deleteMany({ where: { ipHash: IP } });
  for (let i = 0; i < LOGIN_LIMITS.perEmailPerHour; i++) await signIn(email, "definitely-wrong", IP);
  const th = await loginThrottled(email, IP);
  t("repeated failures throttle the account", th.throttled && th.reason === "account");
  const whileThrottled = await signIn(email, "orbital-kettle-92", IP);
  t("…and even the correct password is refused while throttled", !whileThrottled.ok && /too many attempts/i.test(whileThrottled.message));
  t("…with the attempts recorded in the database, not in memory", (await db.adminLoginAttempt.count({ where: { ipHash: IP } })) > LOGIN_LIMITS.perEmailPerHour);
  t("no attempt row holds a password or a hash", (await db.adminLoginAttempt.findMany({ where: { ipHash: IP }, take: 50 }))
    .every((a) => !/orbital|kettle|\$|scrypt/i.test(`${a.reason ?? ""}${a.emailHash}`)));
  await db.adminLoginAttempt.deleteMany({ where: { ipHash: IP } });

  // ---------------- sessions carry identity and can be revoked
  const row = (await db.adminUser.findUnique({ where: { email } }))!;
  const token = makeToken(Date.now(), { id: row.id, role: row.role, sessionVersion: row.sessionVersion });
  const read = readToken(token);
  t("a session token carries the admin id, role and version", read?.a === row.id && read?.r === "ADMIN" && read?.v === row.sessionVersion);
  t("a tampered token is rejected", readToken(token.slice(0, -4) + "aaaa") === null);
  t("an expired token is rejected", readToken(makeToken(Date.now() - 9 * 3600_000, { id: row.id, role: row.role, sessionVersion: 1 })) === null);
  await revokeSessions(row.id);
  const after = (await db.adminUser.findUnique({ where: { id: row.id } }))!;
  t("revoking bumps the session version, so old cookies stop working", after.sessionVersion === row.sessionVersion + 1);
  t("…and the old token no longer matches it", readToken(token)?.v !== after.sessionVersion);

  // ---------------- the second factor
  const secret = generateSecret();
  t("a TOTP secret is 32 base32 characters (20 bytes)", secret.length === 32 && /^[A-Z2-7]+$/.test(secret));
  t("base32 round-trips", base32Encode(base32Decode(secret)) === secret);
  const now = 1_800_000_000_000;
  const code = totpAt(secret, now);
  t("a code is six digits", /^\d{6}$/.test(code));
  t("the current code verifies", verifyTotp(secret, code, now));
  t("one step of clock drift is tolerated", verifyTotp(secret, totpAt(secret, now - 30_000), now) && verifyTotp(secret, totpAt(secret, now + 30_000), now));
  t("two steps away is not", !verifyTotp(secret, totpAt(secret, now - 90_000), now));
  t("a wrong code fails", !verifyTotp(secret, "000000", now) || totpAt(secret, now) === "000000");
  t("a malformed code fails without throwing", !verifyTotp(secret, "abc", now) && !verifyTotp(secret, "", now));
  t("a different secret does not verify", !verifyTotp(generateSecret(), code, now));
  t("the provisioning URI is one an authenticator can read", provisioningUri(secret, "a@b.co").startsWith("otpauth://totp/") && provisioningUri(secret, "a@b.co").includes(`secret=${secret}`));

  const { codes, hashes } = makeRecoveryCodes(4);
  await db.adminUser.update({ where: { id: row.id }, data: { recoveryCodeHashes: hashes } });
  t("recovery codes are generated", codes.length === 4);
  t("…stored only as hashes", !hashes.includes(codes[0]));
  t("a recovery code works once", (await consumeRecoveryCode(row.id, codes[0])) === true);
  t("…and not twice", (await consumeRecoveryCode(row.id, codes[0])) === false);
  t("…while the others still work", (await consumeRecoveryCode(row.id, codes[1])) === true);
  t("a made-up code fails", (await consumeRecoveryCode(row.id, "AAAAA-BBBBB")) === false);

  // ---------------- audit entries name the administrator
  await audit({ action: "Test action", targetType: "AdminUser", targetId: row.id, detail: "a detail" },
    { kind: "ADMIN", id: row.id, email: row.email });
  const entry = await db.auditLog.findFirst({ where: { actorId: row.id, action: "Test action" }, include: { actor: true } });
  t("an audit entry records the acting administrator", entry?.actorId === row.id);
  t("…their email as it was at the time", entry?.actorEmail === row.email);
  t("…and what kind of actor it was", entry?.actorKind === "ADMIN");
  t("…and it joins back to the account", entry?.actor?.email === row.email);

  await audit({ action: "System action", targetType: "AdminUser", targetId: row.id }, { kind: "SYSTEM" });
  const sys = await db.auditLog.findFirst({ where: { action: "System action", targetId: row.id } });
  t("a system action has no actor id, rather than a fabricated one", sys?.actorId === null && sys?.actorKind === "SYSTEM");

  // The audit log must never carry secrets.
  const all = await db.auditLog.findMany({ where: { targetId: row.id } });
  t("no audit entry contains a password or a token", all.every((e) => !/orbital-kettle|scrypt|setupToken/i.test(`${e.detail ?? ""}`)));

  // ---------------- the last super admin cannot be removed, which is enforced in the action layer
  const supers = await db.adminUser.count({ where: { role: "SUPER_ADMIN", active: true } });
  t("there is at least one active super admin in dev", supers >= 1, `${supers}`);

  await cleanup();
  console.log(fail === 0 ? "\nALL ADMIN ACCOUNT TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
