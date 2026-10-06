"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { websiteHost } from "@/lib/business";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (msg: string): never => redirect(`/admin/owner-inbox?msg=${encodeURIComponent(msg)}`);
const audit = (action: string, targetType: string, targetId: string, detail?: string) => db.auditLog.create({ data: { action, targetType, targetId, detail } });

export async function resolveChangeRequest(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id"), decision = s(fd, "decision"), note = s(fd, "note").slice(0, 500);
  const r = await db.profileChangeRequest.findUnique({ where: { id }, include: { business: true } });
  if (!r || r.status !== "OPEN") return back("Request not found or already handled");
  if (!["DONE", "DECLINED"].includes(decision)) return back("Unknown decision");
  if (decision === "DECLINED" && note.length < 5) return back("Say why you're declining");
  await db.profileChangeRequest.update({ where: { id }, data: { status: decision, adminNote: note || null } });
  const owner = await db.owner.findUnique({ where: { id: r.ownerId } });
  if (owner) await sendMail(owner.email, `Your change request for ${r.business.name}`, decision === "DONE" ? `We've made the change you asked for on ${r.business.name}.${note ? `\n\n${note}` : ""}` : `We couldn't make that change to ${r.business.name}.\n\n${note}`);
  await audit(`CHANGE_REQUEST_${decision}`, "ProfileChangeRequest", id, note);
  back(decision === "DONE" ? "Marked done — owner emailed" : "Declined — owner emailed");
}

export async function updateCoverageRequest(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id"), status = s(fd, "status"), note = s(fd, "note").slice(0, 500);
  if (!["NEW", "CONSIDERING", "COMMISSIONED", "DECLINED"].includes(status)) return back("Unknown status");
  await db.coverageRequest.update({ where: { id }, data: { status, adminNote: note || null } });
  await audit("COVERAGE_REQUEST_UPDATED", "CoverageRequest", id, status);
  back("Updated — the owner sees this status in their dashboard");
}

/** Restores the previous values recorded in an owner edit (admin judgement call, always logged). */
export async function revertOwnerEdit(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const log = await db.businessEditLog.findUnique({ where: { id } });
  if (!log || log.revertedAt) return back("Edit not found or already reverted");
  const changes = JSON.parse(log.changes) as Record<string, { from: unknown; to: unknown }>;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) data[k] = v.from;
  if ("website" in data) data.websiteHost = websiteHost(data.website as string | null);
  await db.$transaction([db.business.update({ where: { id: log.businessId }, data }), db.businessEditLog.update({ where: { id }, data: { revertedAt: new Date() } })]);
  await audit("OWNER_EDIT_REVERTED", "Business", log.businessId, Object.keys(changes).join(", "));
  revalidatePath("/", "layout");
  back(`Reverted ${Object.keys(changes).length} field(s)`);
}
