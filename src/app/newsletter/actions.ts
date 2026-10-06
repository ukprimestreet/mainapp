"use server";
import { z } from "zod";
import { checkFormToken, ipHash, isDisposableEmail, newToken, sha256 } from "@/lib/antispam";
import { db } from "@/lib/db";
import { sendMail, siteLink } from "@/lib/mail";
import { readUnsubToken } from "@/lib/newsletter";

export type NlState = { ok?: boolean; message?: string; error?: string };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);

export async function subscribe(_: NlState, fd: FormData): Promise<NlState> {
  if (String(fd.get("fax_number") ?? "")) return { ok: true, message: "Check your email to confirm." }; // honeypot
  const t = checkFormToken(String(fd.get("ft") ?? ""), { minMs: 1500 });
  if (t === "too-fast") return { error: "That was quick — please try again." };
  if (t !== "ok") return { error: "This form has expired. Please reload the page." };
  const p = emailSchema.safeParse(fd.get("email"));
  if (!p.success) return { error: p.error.issues[0].message };
  const email = p.data;
  if (isDisposableEmail(email)) return { error: "Please use a permanent email address." };
  const ip = await ipHash();
  if ((await db.newsletterSubscriber.count({ where: { ipHash: ip, createdAt: { gte: new Date(Date.now() - 3600_000) } } })) >= 5) return { error: "Too many sign-ups from this connection. Please try again later." };

  const same = { ok: true, message: "Almost there — check your email and press the confirm link." };
  const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
  if (existing?.status === "ACTIVE") return same; // identical response; we never email an already-subscribed address on request
  const token = newToken();
  const row = existing
    ? await db.newsletterSubscriber.update({ where: { id: existing.id }, data: { status: "PENDING", confirmHash: sha256(token), unsubscribedAt: null } }) // re-subscribe or re-send confirmation
    : await db.newsletterSubscriber.create({ data: { email, status: "PENDING", confirmHash: sha256(token), source: String(fd.get("source") ?? "").slice(0, 40) || null, ipHash: ip } });
  void row;
  await sendMail(email, "Confirm your PrimeStreet subscription", `Thanks for subscribing to the PrimeStreet weekly digest.\n\nConfirm your email address:\n\n${siteLink(`/newsletter/confirm/${token}`)}\n\nIf you didn't sign up, ignore this email and you won't hear from us again.`);
  return same;
}

/** POST (button) so email scanners that pre-open links can't subscribe someone. */
export async function confirmSubscription(token: string): Promise<NlState> {
  const s = await db.newsletterSubscriber.findFirst({ where: { confirmHash: sha256(token) } });
  if (!s) return { error: "This confirmation link isn't valid any more." };
  if (s.status !== "ACTIVE") await db.newsletterSubscriber.update({ where: { id: s.id }, data: { status: "ACTIVE", confirmedAt: new Date(), unsubscribedAt: null } });
  return { ok: true, message: "You're subscribed. Welcome to PrimeStreet." };
}

export async function unsubscribe(token: string): Promise<NlState> {
  const id = readUnsubToken(token);
  if (!id) return { error: "This unsubscribe link isn't valid." };
  await db.newsletterSubscriber.updateMany({ where: { id }, data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() } });
  return { ok: true, message: "You've been unsubscribed. We won't email you again." };
}
