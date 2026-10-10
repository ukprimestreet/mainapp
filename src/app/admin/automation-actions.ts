"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { runAutomation } from "@/lib/automations";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const back = (msg: string, extra = "") => redirect(`/admin/automations?msg=${encodeURIComponent(msg)}${extra}`);

export async function toggleAutomation(form: FormData) {
  await requireAdmin();
  const key = s(form, "key"), on = s(form, "enabled") === "1";
  await db.automation.upsert({ where: { key }, create: { key, enabled: on }, update: { enabled: on } });
  await db.auditLog.create({ data: { action: on ? "Automation enabled" : "Automation disabled", targetType: "Automation", targetId: key, detail: process.env.ADMIN_EMAIL ?? "admin" } });
  back(on ? `"${key}" is on. It will send on the next run.` : `"${key}" is off. Nothing further will send.`);
}

export async function setCap(form: FormData) {
  await requireAdmin();
  const key = s(form, "key");
  const cap = Math.max(1, Math.min(500, Number(s(form, "dailyCap")) || 50));
  await db.automation.upsert({ where: { key }, create: { key, dailyCap: cap }, update: { dailyCap: cap } });
  back(`"${key}" will send at most ${cap} per run.`);
}

/** Shows exactly who would receive it, and sends nothing. */
export async function dryRun(form: FormData) {
  await requireAdmin();
  const key = s(form, "key");
  const r = await runAutomation(key, { dryRun: true, byAdmin: process.env.ADMIN_EMAIL });
  if (r.error) back(`Dry run failed: ${r.error}`);
  back(`Dry run: ${r.candidates.length} would receive "${key}". Nothing was sent.`, `&preview=${encodeURIComponent(key)}`);
}

export async function runNow(form: FormData) {
  await requireAdmin();
  const key = s(form, "key");
  const r = await runAutomation(key, { byAdmin: process.env.ADMIN_EMAIL });
  if (r.error) back(`Did not run: ${r.error}`);
  back(`Sent ${r.sent}${r.skipped ? `, skipped ${r.skipped} on consent or the frequency cap` : ""}.`);
}

export async function pauseAll() {
  await requireAdmin();
  const n = await db.automation.updateMany({ where: { enabled: true }, data: { enabled: false } });
  await db.auditLog.create({ data: { action: "All automations paused", targetType: "Automation", targetId: "*", detail: process.env.ADMIN_EMAIL ?? "admin" } });
  back(`Stopped. ${n.count} ${n.count === 1 ? "automation is" : "automations are"} now off.`);
}
