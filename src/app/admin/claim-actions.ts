"use server";
import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sha256 } from "@/lib/antispam";
import { db } from "@/lib/db";
import { sendMail, siteLink } from "@/lib/mail";
import { claimEvidence, grantOwnership } from "@/lib/owner";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (msg: string, to = "/admin/claims"): never => redirect(`${to}?msg=${encodeURIComponent(msg)}`);
const audit = (action: string, targetType: string, targetId: string, detail?: string) => db.auditLog.create({ data: { action, targetType, targetId, detail } });

export async function decideClaim(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id"), decision = s(fd, "decision"), notes = s(fd, "notes").slice(0, 1000);
  const claim = await db.claimRequest.findUnique({ where: { id }, include: { business: true } });
  if (!claim) return back("Claim not found");
  if (claim.kind !== "CLAIM") return back("Use the dispute actions for disputes");
  if (claim.status !== "PENDING" && claim.status !== "NEEDS_INFO") return back("That claim is already closed");
  const ev = claimEvidence(claim);

  if (decision === "APPROVE") {
    const wantVerified = !!fd.get("verified");
    if (!ev.canApprove) return back("Can't approve: the claimant hasn't confirmed their email address yet");
    if (wantVerified && !ev.canVerify) return back("Can't mark Verified: needs a business-domain email or a successful phone call-back. Approve as Claimed, or get proof first");
    if (claim.business.claimStatus === "CLAIMED" || claim.business.claimStatus === "VERIFIED") return back("This business is already claimed — revoke the existing ownership first");
    const level = wantVerified ? "VERIFIED" : "CLAIMED";
    const owner = await grantOwnership(claim);
    await db.$transaction([
      db.claimRequest.update({ where: { id }, data: { status: "APPROVED", adminNotes: notes || null, decidedAt: new Date() } }),
      db.business.update({ where: { id: claim.businessId }, data: { claimStatus: level } }),
      // any other open claims on the same business are closed: one owner at a time
      db.claimRequest.updateMany({ where: { businessId: claim.businessId, kind: "CLAIM", id: { not: id }, status: { in: ["PENDING", "NEEDS_INFO"] } }, data: { status: "REJECTED", adminNotes: "Another claim for this business was approved.", decidedAt: new Date() } }),
    ]);
    await sendMail(claim.email, `Your claim of ${claim.business.name} is approved`, `Good news — you now manage ${claim.business.name} on PrimeStreet${level === "VERIFIED" ? " (Verified)" : ""}.\n\nSign in with your email address (we'll send you a one-time link):\n\n${siteLink("/owner/login")}\n\nFrom your dashboard you can update your profile, reply to reviews and tell us your story.`);
    await audit(`CLAIM_APPROVE_${level}`, "ClaimRequest", id, `${claim.business.name} → owner ${owner.email}${notes ? `: ${notes}` : ""}`);
  } else if (decision === "REJECT") {
    if (notes.length < 5) return back("Add a short reason when rejecting (it's emailed to the claimant)");
    await db.claimRequest.update({ where: { id }, data: { status: "REJECTED", adminNotes: notes, decidedAt: new Date() } });
    const others = await db.claimRequest.count({ where: { businessId: claim.businessId, kind: "CLAIM", status: { in: ["PENDING", "NEEDS_INFO"] } } });
    if (!others && claim.business.claimStatus === "PENDING") await db.business.update({ where: { id: claim.businessId }, data: { claimStatus: "UNCLAIMED" } });
    await sendMail(claim.email, `About your claim of ${claim.business.name}`, `We couldn't approve your claim of ${claim.business.name}.\n\nReason: ${notes}\n\nIf you think this is a mistake, reply to this email or submit a new claim with more evidence.`);
    await audit("CLAIM_REJECT", "ClaimRequest", id, notes);
  } else if (decision === "NEEDS_INFO") {
    if (notes.length < 5) return back("Tell the claimant what information you need");
    await db.claimRequest.update({ where: { id }, data: { status: "NEEDS_INFO", adminNotes: notes } });
    await sendMail(claim.email, `More information needed for your claim of ${claim.business.name}`, `We need a little more information:\n\n${notes}\n\nReply on your claim page: (use the status link in your first email, or submit your claim again to get a fresh link).`);
    await audit("CLAIM_NEEDS_INFO", "ClaimRequest", id, notes);
  } else return back("Unknown decision");
  revalidatePath("/", "layout");
  back({ APPROVE: "Claim approved — owner account created and emailed", REJECT: "Claim rejected — claimant emailed", NEEDS_INFO: "More information requested — claimant emailed" }[decision] ?? "Done");
}

/** Phone call-back proof: the admin phones the business's LISTED number (not the claimant's) and reads out this one-time code. */
export async function generatePhoneCode(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const claim = await db.claimRequest.findUnique({ where: { id }, include: { business: true } });
  if (!claim || claim.kind !== "CLAIM") return back("Claim not found");
  if (!claim.business.phone) return back("This business has no listed phone number to call — add one first (Admin → Businesses) or use another check");
  const code = String(randomInt(100000, 1000000));
  await db.claimRequest.update({ where: { id }, data: { phoneCodeHash: sha256(`${id}:${code}`), phoneCodeSetAt: new Date(), phoneAttempts: 0, phoneVerifiedAt: null } });
  await audit("CLAIM_PHONE_CODE_ISSUED", "ClaimRequest", id, claim.business.phone);
  back(`Code ${code} — phone ${claim.business.phone} (the number listed on the profile) and read it out. It expires in 48 hours. This is the only time it is shown.`);
}

/** Removes every owner from a business and returns it to Unclaimed (wrong claim, owner left, dispute upheld). */
export async function revokeOwnership(fd: FormData) {
  await requireAdmin();
  const businessId = s(fd, "businessId"), reason = s(fd, "reason").slice(0, 500), back_to = s(fd, "to") || "/admin/claims";
  if (reason.length < 5) return back("Give a reason for revoking ownership", back_to);
  const b = await db.business.findUnique({ where: { id: businessId }, include: { owners: { include: { owner: true } } } });
  if (!b) return back("Business not found", back_to);
  await db.$transaction([
    db.businessOwner.deleteMany({ where: { businessId } }),
    db.business.update({ where: { id: businessId }, data: { claimStatus: "UNCLAIMED" } }),
  ]);
  for (const o of b.owners) await sendMail(o.owner.email, `Your access to ${b.name} was removed`, `Your PrimeStreet access to ${b.name} was removed.\n\nReason: ${reason}\n\nIf you believe this is wrong, contact us and we'll review it.`);
  await audit("OWNERSHIP_REVOKED", "Business", businessId, `${b.owners.map((o) => o.owner.email).join(", ")}: ${reason}`);
  revalidatePath("/", "layout");
  back(`Ownership of ${b.name} revoked — it is Unclaimed again`, back_to);
}

export async function resolveDispute(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id"), decision = s(fd, "decision"), notes = s(fd, "notes").slice(0, 1000);
  const d = await db.claimRequest.findUnique({ where: { id }, include: { business: true } });
  if (!d || d.kind !== "DISPUTE") return back("Dispute not found");
  if (notes.length < 5) return back("Add a note explaining the outcome");
  await db.claimRequest.update({ where: { id }, data: { status: decision === "UPHOLD" ? "APPROVED" : "REJECTED", adminNotes: notes, decidedAt: new Date() } });
  await sendMail(d.email, `Outcome of your report about ${d.business.name}`, decision === "UPHOLD" ? `We reviewed your report and acted on it.\n\n${notes}` : `We reviewed your report and made no change.\n\n${notes}`);
  await audit(`DISPUTE_${decision}`, "ClaimRequest", id, notes);
  back(decision === "UPHOLD" ? "Dispute upheld — now revoke ownership below if appropriate" : "Dispute dismissed");
}
