"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { SEND_LIMIT, buildDigest, renderForRecipient, unsubUrl } from "@/lib/newsletter";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (id: string, msg: string): never => redirect(`/admin/newsletter/${id}?msg=${encodeURIComponent(msg)}`);
const audit = (action: string, id: string, detail?: string) => db.auditLog.create({ data: { action, targetType: "Newsletter", targetId: id, detail } });

export async function createDigest() {
  await requireAdmin();
  const d = await buildDigest(7);
  if (!d) redirect(`/admin/newsletter?msg=${encodeURIComponent("Nothing new from the last 7 days (real content only) — nothing to send")}`);
  const issue = await db.newsletterIssue.create({ data: { subject: d.subject, body: d.body } });
  await audit("NEWSLETTER_DRAFT", issue.id, d.subject);
  redirect(`/admin/newsletter/${issue.id}?msg=${encodeURIComponent(`Draft built: ${d.counts.articles} stories, ${d.counts.episodes} episode, ${d.counts.businesses} new businesses. Edit it, send yourself a test, then send.`)}`);
}

export async function saveIssue(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id"), subject = s(fd, "subject"), body = String(fd.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const issue = await db.newsletterIssue.findUnique({ where: { id } });
  if (!issue) redirect("/admin/newsletter");
  if (issue.sentAt) return back(id, "This issue has already been sent and can't be edited");
  if (subject.length < 5 || subject.length > 120) return back(id, "Subject must be 5–120 characters");
  if (body.length < 50) return back(id, "Body is too short");
  if (!body.includes("{{unsubscribe}}")) return back(id, "The body must contain {{unsubscribe}} — every email needs an unsubscribe link");
  await db.newsletterIssue.update({ where: { id }, data: { subject, body } });
  back(id, "Saved");
}

export async function sendTest(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const issue = await db.newsletterIssue.findUnique({ where: { id } });
  if (!issue) redirect("/admin/newsletter");
  const to = (process.env.ADMIN_EMAIL ?? "").trim();
  if (!to) return back(id, "ADMIN_EMAIL is not configured");
  await sendMail(to, `[TEST] ${issue.subject}`, renderForRecipient(issue.body, "test-subscriber"), { purpose: "digest" });
  back(id, `Test sent to ${to} (see Admin → Outbox if no email provider is configured)`);
}

export async function sendIssue(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const issue = await db.newsletterIssue.findUnique({ where: { id } });
  if (!issue) redirect("/admin/newsletter");
  if (issue.sentAt) return back(id, "Already sent");
  if (fd.get("confirm") !== "on") return back(id, "Tick the confirmation box to send to every subscriber");
  if (!issue.body.includes("{{unsubscribe}}")) return back(id, "The body must contain {{unsubscribe}}");
  // claim the issue first (atomic) so a double-click can't send twice
  const claimed = await db.newsletterIssue.updateMany({ where: { id, sentAt: null }, data: { sentAt: new Date() } });
  if (claimed.count !== 1) return back(id, "Already sent");
  const subs = await db.newsletterSubscriber.findMany({ where: { status: "ACTIVE" }, orderBy: { confirmedAt: "asc" }, take: SEND_LIMIT });
  for (const sub of subs) await sendMail(sub.email, issue.subject, renderForRecipient(issue.body, sub.id), { purpose: "digest", headers: { "List-Unsubscribe": `<${unsubUrl(sub.id).replace("/newsletter/unsubscribe/", "/api/newsletter/unsubscribe/")}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
  await db.newsletterIssue.update({ where: { id }, data: { recipients: subs.length } });
  await audit("NEWSLETTER_SENT", id, `${subs.length} recipients`);
  back(id, `Sent to ${subs.length} subscriber${subs.length === 1 ? "" : "s"}`);
}

export async function deleteIssue(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const i = await db.newsletterIssue.findUnique({ where: { id } });
  if (i && !i.sentAt) await db.newsletterIssue.delete({ where: { id } });
  redirect(`/admin/newsletter?msg=${encodeURIComponent(i?.sentAt ? "Sent issues are kept as a record" : "Draft deleted")}`);
}
