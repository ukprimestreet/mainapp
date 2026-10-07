import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { newToken, sha256 } from "./antispam";
import { db } from "./db";
import { sendMail, siteLink } from "./mail";
import { freeSlug, normaliseEmail } from "./authors";

/**
 * Author accounts: passwordless, the same shape as owner accounts. A short-lived single-use emailed link signs the
 * author in; a signed httpOnly cookie carries the session. The signature uses its own purpose prefix ("author:"), so
 * an author cookie can never be replayed as an owner or admin session, and bumping sessionVersion signs them out everywhere.
 */
const COOKIE = "ps_author";
const TTL_MS = 14 * 86400_000;
export const LOGIN_LINK_MS = 20 * 60_000;

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
  return a && a.active && a.sessionVersion === t.v ? a : null;
}
export async function requireAuthor() {
  const a = await getAuthorSession();
  if (!a) redirect("/write/login");
  return a;
}
export async function setAuthorSession(authorId: string, version: number) {
  (await cookies()).set(COOKIE, makeAuthorToken(authorId, version), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TTL_MS / 1000 });
}
export async function clearAuthorSession() { (await cookies()).delete(COOKIE); }

/** An author may only ever touch their own drafts. */
export async function requireOwnArticle(articleId: string) {
  const author = await requireAuthor();
  const article = await db.article.findUnique({ where: { id: articleId }, include: { reviews: { orderBy: { createdAt: "desc" } } } });
  if (!article || article.authorId !== author.id) notFound();
  return { author, article };
}

/** Emails a single-use sign-in link. Never reveals whether the address has an account. */
export async function issueAuthorLink(authorId: string, email: string, purpose: "LOGIN" | "VERIFY_EMAIL" = "LOGIN") {
  const raw = newToken();
  await db.authorLoginToken.create({ data: { authorId, tokenHash: sha256(raw), purpose, expiresAt: new Date(Date.now() + LOGIN_LINK_MS) } });
  const link = siteLink(`/write/login/${raw}`);
  const verifying = purpose === "VERIFY_EMAIL";
  await sendMail(
    email,
    verifying ? "Confirm your PrimeStreet writer account" : "Your PrimeStreet sign-in link",
    [
      verifying ? "Welcome to PrimeStreet." : "Here is your sign-in link.",
      "",
      link,
      "",
      `The link works once and expires in ${Math.round(LOGIN_LINK_MS / 60000)} minutes.`,
      "If you didn't ask for this, you can ignore this email — nothing has changed.",
    ].join("\n"),
  );
}

export async function authorTokenState(token: string): Promise<"ok" | "expired" | "used" | "invalid"> {
  const row = await db.authorLoginToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row) return "invalid";
  if (row.usedAt) return "used";
  return row.expiresAt.getTime() < Date.now() ? "expired" : "ok";
}

/** Consumes the link and starts the session. Also marks the email verified on first use. */
export async function consumeAuthorLink(token: string) {
  const row = await db.authorLoginToken.findUnique({ where: { tokenHash: sha256(token) }, include: { author: true } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now() || !row.author.active) return null;
  await db.authorLoginToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  if (!row.author.emailVerifiedAt) await db.author.update({ where: { id: row.authorId }, data: { emailVerifiedAt: new Date() } });
  await setAuthorSession(row.authorId, row.author.sessionVersion);
  return row.author;
}

/**
 * Sign-up. An address that already has an account is sent a sign-in link instead of being told it exists,
 * so the form can't be used to discover who writes here.
 */
export async function signUpAuthor(nameRaw: string, emailRaw: string) {
  const email = normaliseEmail(emailRaw);
  const name = nameRaw.trim();
  const existing = await db.author.findUnique({ where: { email } });
  if (existing) {
    if (existing.active) await issueAuthorLink(existing.id, email, "LOGIN");
    return;
  }
  const created = await db.author.create({ data: { email, name, slug: await freeSlug(name) } });
  await issueAuthorLink(created.id, email, "VERIFY_EMAIL");
}

/** The author account that admin posts are filed under, so the owner can keep editing them in their own panel. */
export const ADMIN_AUTHOR_EMAIL = process.env.ADMIN_AUTHOR_EMAIL ?? "cc@primestreet.uk";

/** Finds (or creates) that account, so an admin can always post even before the person has signed in. */
export async function adminAuthor() {
  const email = normaliseEmail(ADMIN_AUTHOR_EMAIL);
  const found = await db.author.findUnique({ where: { email } });
  if (found) return found;
  return db.author.create({ data: { email, name: "PrimeStreet", slug: await freeSlug("PrimeStreet") } });
}
