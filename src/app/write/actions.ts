"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  clearAuthorSession, loginKey, requestReset, requireAuthor, sendWelcome, setPasswordFromToken, signIn,
} from "@/lib/author-auth";
import { checkPassword } from "@/lib/author-password";
import { validateProfile } from "@/lib/authors";
import { validateExtras } from "@/lib/author-profile";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();

export type FormState = { error?: string; ok?: string; errors?: Record<string, string> };

/** Finish registration (invitation) or reset a password. Both end at the sign-in page by design. */
async function applyPassword(purpose: "INVITE" | "RESET", fd: FormData): Promise<FormState> {
  const token = s(fd, "token"), password = s(fd, "password"), confirm = s(fd, "confirm");
  const problem = checkPassword(password, confirm, s(fd, "email"));
  if (problem) return { error: problem };
  const done = await setPasswordFromToken(token, password, purpose);
  if (!done) return { error: "That link has expired or has already been used. Ask an editor to send another." };
  if (done.first) await sendWelcome(done.author.id);
  redirect(`/write/login?set=${done.first ? "1" : "2"}`);
}
export async function finishRegistration(_: FormState, fd: FormData): Promise<FormState> { return applyPassword("INVITE", fd); }
export async function finishReset(_: FormState, fd: FormData): Promise<FormState> { return applyPassword("RESET", fd); }

export async function authorSignIn(_: FormState, fd: FormData): Promise<FormState> {
  const r = await signIn(s(fd, "email"), s(fd, "password"), await loginKey());
  if (!r.ok) return { error: r.error };
  redirect("/write");
}

export async function authorSignOut() {
  await clearAuthorSession();
  redirect("/write/login");
}

export async function forgotPassword(_: FormState, fd: FormData): Promise<FormState> {
  await requestReset(s(fd, "email"));
  return { ok: "If that address has an account, a reset link is on its way. The link lasts an hour." };
}

/** Save the profile. The completeness gate reads these fields, so this is the screen that unlocks writing. */
export async function saveAuthorProfile(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAuthor();
  const core = validateProfile({
    name: s(fd, "name"), role: s(fd, "role"), bio: s(fd, "bio"), imageUrl: s(fd, "imageUrl"),
    website: s(fd, "website"), x: s(fd, "x"), facebook: s(fd, "facebook"), instagram: s(fd, "instagram"),
    linkedin: s(fd, "linkedin"), youtube: s(fd, "youtube"), tiktok: s(fd, "tiktok"), threads: s(fd, "threads"),
    bluesky: s(fd, "bluesky"), mastodon: s(fd, "mastodon"),
  } as never);
  const extra = validateExtras({
    phone: s(fd, "phone"), basedIn: s(fd, "basedIn"), experience: s(fd, "experience"),
    cvUrl: s(fd, "cvUrl"), expertise: s(fd, "expertise"), portfolio: s(fd, "portfolio"),
  });
  const errors = { ...core.errors, ...extra.errors };
  if (Object.keys(errors).length) return { errors, error: "Some details need fixing." };
  await db.author.update({ where: { id: me.id }, data: { ...core.value, ...extra.value } });
  return { ok: "Profile saved." };
}

export async function acceptTerms(): Promise<void> {
  const me = await requireAuthor();
  if (!me.acceptedTermsAt) await db.author.update({ where: { id: me.id }, data: { acceptedTermsAt: new Date() } });
  redirect("/write?terms=1");
}
