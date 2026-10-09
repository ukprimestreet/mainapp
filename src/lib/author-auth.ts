import { createHmac, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { newToken, sha256 } from "./antispam";
import { db } from "./db";
import { sendMail, siteLink } from "./mail";
import { freeSlug, normaliseEmail } from "./authors";
import { hashPassword, verifyPassword } from "./author-password";

/**
 * Author accounts. Authors do not sign themselves up: an admin registers them with a name and email, which
 * sends an invitation. The author follows the link once, sets a password, and from then on signs in with it.
 *
 * The session cookie is signed with its own purpose prefix ("author:"), so it can never be replayed as an
 * owner or admin session, and raising sessionVersion signs the author out everywhere.
 */
const COOKIE = "ps_author";
const TTL_MS = 14 * 86400_000;
export const INVITE_MS = 7 * 86400_000; // an invitation is useful for a week
export const RESET_MS = 60 * 60_000;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET (32+ chars) is not configured");
  return s;
};
const sign = (payload: string) => createHmac("sha256", secret()).update(`author:${payload}`).digest("base64url");

export function makeAuthorToken(authorId: string, version: number, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ a: authorId, v: version, exp: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readAuthorToken(token: string | undefined, now = Date.now()): { a: string; v: number } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString());
    return j.exp > now && typeof j.a === "string" ? { a: j.a, v: j.v } : null;
  } catch { return null; }
}

export async function getAuthorSession() {
  const t = readAuthorToken((await cookies()).get(COOKIE)?.value);
  if (!t) return null;
  const a = await db.author.findUnique({ where: { id: t.a } });
  return a && a.active && a.passwordHash && a.sessionVersion === t.v ? a : null;
}
export async function requireAuthor() {
  const a = await getAuthorSession();
  if (!a) redirect("/write/login");
  return a;
}
export async function setAuthorSession(authorId: string, version: number) {
  (await cookies()).set(COOKIE, makeAuthorToken(authorId, version), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TTL_MS / 1000,
  });
}
export async function clearAuthorSession() { (await cookies()).delete(COOKIE); }

/** An author may only ever touch their own work. */
export async function requireOwnArticle(articleId: string) {
  const author = await requireAuthor();
  const article = await db.article.findUnique({ where: { id: articleId }, include: { reviews: { orderBy: { createdAt: "desc" } } } });
  if (!article || article.authorId !== author.id) notFound();
  return { author, article };
}

// ---------------------------------------------------------------- invitations
export type Purpose = "INVITE" | "RESET";

async function issueLink(authorId: string, purpose: Purpose) {
  const raw = newToken();
  const ttl = purpose === "INVITE" ? INVITE_MS : RESET_MS;
  await db.authorLoginToken.create({ data: { authorId, tokenHash: sha256(raw), purpose, expiresAt: new Date(Date.now() + ttl) } });
  return { raw, link: siteLink(`/write/${purpose === "INVITE" ? "welcome" : "reset"}/${raw}`) };
}

/** Admin registers an author: creates the account and emails the invitation to finish registering. */
export async function inviteAuthor(nameRaw: string, emailRaw: string, invitedBy: string) {
  const email = normaliseEmail(emailRaw);
  const name = nameRaw.trim();
  const existing = await db.author.findUnique({ where: { email } });
  if (existing?.passwordHash) return { ok: false as const, error: `${email} already has an account.` };

  const author = existing
    ? await db.author.update({ where: { id: existing.id }, data: { name, active: true, invitedAt: new Date(), invitedBy } })
    : await db.author.create({ data: { email, name, slug: await freeSlug(name), invitedAt: new Date(), invitedBy } });

  const { link } = await issueLink(author.id, "INVITE");
  await sendMail(
    email,
    "Finish setting up your PrimeStreet writer account",
    [
      `Hello ${name},`,
      "",
      "An editor has created a PrimeStreet writer account for you. To finish registering, follow this link and choose a password:",
      "",
      link,
      "",
      `The link works once and expires in ${Math.round(INVITE_MS / 86400_000)} days. If it expires, ask an editor to send another.`,
      "",
      "After that you will sign in with your email address and the password you choose.",
      "",
      "PrimeStreet",
    ].join("\n"),
    { purpose: "accounts" },
  );
  return { ok: true as const, author };
}

export async function resendInvite(authorId: string) {
  const a = await db.author.findUnique({ where: { id: authorId } });
  if (!a?.email || a.passwordHash) return false;
  await db.authorLoginToken.updateMany({ where: { authorId, purpose: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
  await inviteAuthor(a.name, a.email, a.invitedBy ?? "admin");
  return true;
}

export async function tokenState(token: string, purpose: Purpose): Promise<"ok" | "expired" | "used" | "invalid"> {
  const row = await db.authorLoginToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.purpose !== purpose) return "invalid";
  if (row.usedAt) return "used";
  return row.expiresAt.getTime() < Date.now() ? "expired" : "ok";
}

/**
 * Consumes an invitation or reset link and sets the password. Signs the author out of other devices
 * (sessionVersion) so a stolen link cannot leave a session behind, and does NOT sign them in: they are
 * sent to the sign-in page to use the password they have just chosen.
 */
export async function setPasswordFromToken(token: string, password: string, purpose: Purpose) {
  const row = await db.authorLoginToken.findUnique({ where: { tokenHash: sha256(token) }, include: { author: true } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() < Date.now() || !row.author.active) return null;
  const first = !row.author.passwordHash;
  await db.$transaction([
    db.authorLoginToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.author.update({
      where: { id: row.authorId },
      data: {
        passwordHash: hashPassword(password),
        sessionVersion: { increment: 1 },
        emailVerifiedAt: row.author.emailVerifiedAt ?? new Date(),
      },
    }),
  ]);
  return { author: row.author, first };
}

/** The welcome email: what we expect, and where the author terms are. Sent once. */
export async function sendWelcome(authorId: string) {
  const a = await db.author.findUnique({ where: { id: authorId } });
  if (!a?.email || a.welcomedAt) return false;
  await sendMail(
    a.email,
    "Welcome to PrimeStreet — what happens next",
    [
      `Hello ${a.name},`,
      "",
      "Your writer account is ready. Here is how PrimeStreet works.",
      "",
      "1. Complete your profile first.",
      "   Readers should be able to see who wrote a piece and why they are worth reading, so your profile must be",
      "   at least 90% complete before you can send anything for review. That means a portrait, a job title, an",
      "   'about you' section, a phone number, where you are based, your past experience, a CV, the subjects you",
      "   cover, at least one social link and at least one link to work published elsewhere.",
      "",
      "2. Write in your own words, from sources you can name.",
      "   We do not publish invented facts, invented quotes, or descriptions and reviews copied from other",
      "   directories. Cite the primary source for anything factual and say when you checked it.",
      "",
      "3. Label anything paid for.",
      "   Sponsored, partner and advertorial pieces must name the sponsor. Editorial independence is the product.",
      "",
      "4. Submit, then an editor reviews.",
      "   You keep drafts for as long as you like. When you submit, an editor either publishes the piece or sends",
      "   it back with feedback you will see on your dashboard. Every decision comes with a reason.",
      "",
      "The full author terms are here (sign in first):",
      siteLink("/write/terms"),
      "",
      "Your dashboard:",
      siteLink("/write"),
      "",
      "PrimeStreet",
    ].join("\n"),
    { purpose: "editorial" },
  );
  await db.author.update({ where: { id: authorId }, data: { welcomedAt: new Date() } });
  return true;
}

// ---------------------------------------------------------------- sign in
const fails = new Map<string, { n: number; until: number }>();
const LOCK_MS = 15 * 60_000, MAX_FAILS = 6;
export function loginLocked(key: string, now = Date.now()) { const f = fails.get(key); return !!f && f.n >= MAX_FAILS && f.until > now; }
function recordFail(key: string, now = Date.now()) {
  const f = fails.get(key);
  fails.set(key, !f || f.until < now ? { n: 1, until: now + LOCK_MS } : { n: f.n + 1, until: f.until });
}
export async function loginKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

/** Signs an author in. The same message is returned whatever went wrong, so the form cannot enumerate accounts. */
export async function signIn(emailRaw: string, password: string, key: string) {
  if (loginLocked(key)) return { ok: false as const, error: "Too many attempts. Try again in 15 minutes." };
  const email = normaliseEmail(emailRaw);
  const a = await db.author.findUnique({ where: { email } });
  const good = !!a && a.active && verifyPassword(password, a.passwordHash);
  if (!good) {
    recordFail(key);
    return { ok: false as const, error: "That email address and password do not match an account." };
  }
  fails.delete(key);
  await db.author.update({ where: { id: a!.id }, data: { lastLoginAt: new Date() } });
  await setAuthorSession(a!.id, a!.sessionVersion);
  return { ok: true as const, author: a! };
}

/** Forgotten password. Always reports success so the form cannot be used to discover who writes here. */
export async function requestReset(emailRaw: string) {
  const a = await db.author.findUnique({ where: { email: normaliseEmail(emailRaw) } });
  if (!a?.email || !a.active) return;
  const { link } = await issueLink(a.id, "RESET");
  await sendMail(
    a.email,
    "Reset your PrimeStreet password",
    [
      `Hello ${a.name},`, "",
      "Follow this link to choose a new password:", "", link, "",
      `The link works once and expires in ${Math.round(RESET_MS / 60000)} minutes.`,
      "If you didn't ask for this, you can ignore this email — nothing has changed.",
    ].join("\n"),
    { purpose: "accounts" },
  );
}

/** The author account that admin posts are filed under, so the owner can keep editing them in their own panel. */
export const ADMIN_AUTHOR_EMAIL = normaliseEmail(process.env.ADMIN_AUTHOR_EMAIL ?? "cc@primestreet.uk");

export async function adminAuthor() {
  const found = await db.author.findUnique({ where: { email: ADMIN_AUTHOR_EMAIL } });
  if (found) return found;
  return db.author.create({ data: { email: ADMIN_AUTHOR_EMAIL, name: "PrimeStreet", slug: await freeSlug("PrimeStreet") } });
}
