"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { LEAD_CLOSE_REASONS, type LeadCloseReason } from "@/lib/reasons";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (msg: string, extra = "") => redirect(`/admin/leads?msg=${encodeURIComponent(msg)}${extra}`);

/**
 * Reveals a customer's name, email and phone.
 *
 * Permission is checked **on the server**, here, where the work happens. The page also hides the button, but
 * hiding a button is a courtesy, not a control. Every reveal is recorded with the administrator's identity
 * and the lead's reference — never the contact details themselves, which belong in one place only.
 */
export async function revealCustomer(fd: FormData) {
  await requirePermission("leads.customer_contact");
  const id = s(fd, "id");
  const job = await db.jobRequest.findUnique({ where: { id }, select: { reference: true } });
  if (!job) back("That request no longer exists.");

  await audit({
    action: "Customer contact details viewed",
    targetType: "JobRequest", targetId: id,
    detail: `Lead ${job!.reference}`,
  });
  redirect(`/admin/leads?reveal=${id}`);
}

/** Closes a request, with a reason. A lead that quietly disappears teaches nobody anything. */
export async function closeLead(fd: FormData) {
  await requirePermission("leads.assign");
  const id = s(fd, "id");
  const reason = s(fd, "reason");
  if (!(reason in LEAD_CLOSE_REASONS)) back("Choose why you are closing it.");

  const job = await db.jobRequest.findUnique({ where: { id }, select: { reference: true, status: true } });
  if (!job) back("That request no longer exists.");
  if (job!.status === "CLOSED") back(`${job!.reference} was already closed.`);

  await db.jobRequest.update({ where: { id }, data: { status: "CLOSED", closedReason: reason } });
  await audit({
    action: "Lead closed",
    targetType: "JobRequest", targetId: id,
    detail: `${job!.reference}: ${LEAD_CLOSE_REASONS[reason as LeadCloseReason]}`,
  });
  back(`${job!.reference} closed.`);
}

/**
 * Puts a closed request back in the queue.
 *
 * Exists because closing is the cheap action and the one most likely to be wrong — a request closed as
 * "nobody covers this" becomes serviceable the day somebody registers.
 */
export async function reopenLead(fd: FormData) {
  await requirePermission("leads.assign");
  const id = s(fd, "id");
  const job = await db.jobRequest.findUnique({ where: { id }, select: { reference: true, providersAtCreation: true } });
  if (!job) back("That request no longer exists.");

  await db.jobRequest.update({
    where: { id },
    // Back to where it would have been, not to a state that pretends supply existed.
    data: { status: job!.providersAtCreation === 0 ? "UNASSIGNED" : "NEW", closedReason: null },
  });
  await audit({ action: "Lead reopened", targetType: "JobRequest", targetId: id, detail: job!.reference });
  back(`${job!.reference} is back in the queue.`);
}
