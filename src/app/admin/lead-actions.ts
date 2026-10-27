"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyAssignment } from "@/lib/lead-notify";
import { assignManually, matchJobRequest, reverseAssignment } from "@/lib/matching";
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
  // The caller says where to come back to, so a reveal from the detail page stays on it. Checked against a
  // prefix rather than trusted: a redirect target taken from a form is a redirect target an attacker can set.
  const to = s(fd, "to");
  const back_to = to.startsWith("/admin/leads") ? to : "/admin/leads";
  redirect(`${back_to}?reveal=${id}`);
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

/**
 * Re-runs matching for one request.
 *
 * Safe to press twice: the matcher fills only places that are still free, charges nobody twice, and records
 * why each business was skipped. Useful the moment a new business registers in an area we could not cover.
 */
export async function rematchLead(fd: FormData) {
  await requirePermission("leads.assign");
  const id = s(fd, "id");
  const job = await db.jobRequest.findUnique({ where: { id }, select: { reference: true } });
  if (!job) back("That request no longer exists.");

  const result = await matchJobRequest(id);
  for (const a of result.assigned) {
    const assignment = await db.leadAssignment.findFirst({
      where: { jobRequestId: id, businessId: a.businessId, notifiedAt: null }, select: { id: true },
    });
    if (assignment) await notifyAssignment(assignment.id);
  }
  await audit({
    action: "Lead matching re-run", targetType: "JobRequest", targetId: id,
    detail: `${job!.reference}: considered ${result.considered}, assigned ${result.assigned.length}, now ${result.status.toLowerCase()}`,
  });
  const summary = result.assigned.length
    ? `${job!.reference} went to ${result.assigned.map((a) => a.name).join(" and ")}.`
    : `${job!.reference}: nobody new could take it. The reasons are listed against the request.`;
  redirect(`/admin/leads/${id}?msg=${encodeURIComponent(summary)}`);
}

/** Assigning by hand. PAID charges a credit and takes one of the two places; SPONSORED does neither. */
export async function assignLead(fd: FormData) {
  const session = await requirePermission("leads.assign");
  const id = s(fd, "id");
  const businessId = s(fd, "businessId");
  const kind = s(fd, "kind") === "SPONSORED" ? "SPONSORED" : "PAID";
  const reason = s(fd, "reason");
  if (!businessId) redirect(`/admin/leads/${id}?msg=${encodeURIComponent("Choose a business first.")}`);

  const result = await assignManually(id, businessId, {
    kind, reason,
    adminId: session.kind === "LEGACY" ? null : session.admin.id,
  });
  if (result.ok) await notifyAssignment(result.assignmentId);
  const msg = result.ok
    ? `Assigned${result.charged ? " and one credit charged" : " as sponsored, nothing charged"}, and the business has been emailed.`
    : result.message;
  redirect(`/admin/leads/${id}?msg=${encodeURIComponent(msg)}`);
}

/** Takes an assignment back and refunds the credit if one was charged. */
export async function reverseLeadAssignment(fd: FormData) {
  await requirePermission("leads.assign");
  const id = s(fd, "id");
  const assignmentId = s(fd, "assignmentId");
  const result = await reverseAssignment(assignmentId, s(fd, "reason"));
  const msg = result.ok
    ? result.refunded ? "Reversed, and the credit has been put back." : "Reversed. There was no credit to put back."
    : result.message;
  redirect(`/admin/leads/${id}?msg=${encodeURIComponent(msg)}`);
}
