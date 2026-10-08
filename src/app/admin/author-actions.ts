"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { inviteAuthor, resendInvite } from "@/lib/author-auth";
import { validEmail } from "@/lib/authors";
import { sendMail } from "@/lib/mail";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const audit = (action: string, targetId: string, detail?: string) =>
  db.auditLog.create({ data: { action, targetType: "Author", targetId, detail } });
const back = (msg: string, path = "/admin/authors") => redirect(`${path}?msg=${encodeURIComponent(msg)}`);

/** Register a writer: creates the account and emails them a link to finish setting it up. */
export async function registerAuthor(form: FormData) {
  await requireAdmin();
  const name = s(form, "name").trim(), email = s(form, "email").trim();
  if (name.length < 2) back("Enter the writer's full name.");
  if (!validEmail(email)) back("Enter a valid email address.");
  const r = await inviteAuthor(name, email, process.env.ADMIN_EMAIL ?? "admin");
  if (!r.ok) back(r.error);
  await audit("Author registered", r.author!.id, `${name} <${email}>`);
  back(`Invitation sent to ${email}. They have 7 days to set a password.`);
}

export async function reinvite(form: FormData) {
  await requireAdmin();
  const id = s(form, "id");
  const ok = await resendInvite(id);
  await audit("Author invitation resent", id);
  back(ok ? "A fresh invitation is on its way." : "That writer has already set a password.");
}

/** Suspending keeps the byline on published work but ends the account's access immediately. */
export async function setAuthorActive(form: FormData) {
  await requireAdmin();
  const id = s(form, "id"), active = s(form, "active") === "1";
  const a = await db.author.findUnique({ where: { id } });
  if (!a) back("That writer no longer exists.");
  await db.author.update({ where: { id }, data: { active, sessionVersion: { increment: active ? 0 : 1 } } });
  await audit(active ? "Author reinstated" : "Author suspended", id, a!.name);
  back(active ? `${a!.name} can sign in again.` : `${a!.name} has been signed out and can no longer sign in.`);
}

/** Admin can send a password reset on an author's behalf, for someone locked out of their email link. */
export async function adminResetPassword(form: FormData) {
  await requireAdmin();
  const id = s(form, "id");
  const a = await db.author.findUnique({ where: { id } });
  if (!a?.email) back("That writer has no email address.");
  const { requestReset } = await import("@/lib/author-auth");
  await requestReset(a!.email!);
  await audit("Author password reset sent", id, a!.name);
  back(`A reset link has been emailed to ${a!.email}.`);
}

export async function messageAuthor(form: FormData) {
  await requireAdmin();
  const id = s(form, "id"), note = s(form, "note").trim();
  const a = await db.author.findUnique({ where: { id } });
  if (!a?.email) back("That writer has no email address.");
  if (note.length < 5) back("Write a message first.");
  await sendMail(a!.email!, "A message from the PrimeStreet editors", `${a!.name},\n\n${note}\n\nPrimeStreet`);
  await audit("Author messaged", id, note.slice(0, 120));
  back(`Message sent to ${a!.name}.`);
}
