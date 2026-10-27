import { randomUUID } from "crypto";
import { audit } from "./audit";
import { reverseCredits, spendCredits } from "./credits";
import { db } from "./db";

/**
 * Matching: deciding which businesses get a job request.
 *
 * Four rules this file exists to enforce.
 *
 *   1. **No more than two paying businesses per job.** Enforced by a partial unique index on
 *      (`jobRequestId`, `paidSlot`), not by the control flow below. Two concurrent runs cannot both take
 *      slot 2 — one of them fails the insert, and a failed insert is a far better outcome than a customer
 *      being rung by five trades.
 *   2. **A credit is never taken without an assignment, and an assignment is never recorded as charged
 *      unless it was.** The slot is claimed first, then the credit is spent; if the spend fails the
 *      assignment is removed, which frees the slot for somebody who can pay.
 *   3. **Every inclusion and exclusion is written down**, with a reason and the id of the run that made it.
 *      "Why did I not get that job?" is answered by a row, not a reconstruction.
 *   4. **Re-running is safe.** Nothing is double-charged and nobody is assigned twice; a second run fills
 *      slots that are still free and records why the rest were skipped.
 *
 * Delivery and chasing are Phase F. A business can see an assigned job in its dashboard the moment the
 * assignment exists, which is why charging at assignment is honest: the thing paid for is already there.
 */

export const MAX_PAID = 2;
const SLOTS = [1, 2] as const;

/** Where a candidate came from. The order here is the order they are tried. */
export const STAGES = ["EXACT", "PARENT", "ADMIN_AREA", "NEARBY"] as const;
export type Stage = (typeof STAGES)[number];

const STAGE_WORDS: Record<Stage, string> = {
  EXACT: "covers this exact area",
  PARENT: "covers the whole of the surrounding area",
  ADMIN_AREA: "covers the wider council area",
  NEARBY: "opted in to nearby work",
};

type Decision = {
  businessId?: string | null;
  stage: Stage | "MANUAL" | "RUN";
  outcome: "CONSIDERED" | "ASSIGNED" | "EXCLUDED" | "SKIPPED";
  reason: string;
};

const record = (jobRequestId: string, runId: string, d: Decision) =>
  db.matchDecision.create({
    data: { jobRequestId, runId, businessId: d.businessId ?? null, stage: d.stage, outcome: d.outcome, reason: d.reason },
  });

// ---------------------------------------------------------------- the place tree

/** The chain of ancestors above a place, nearest first. */
async function ancestors(placeId: string): Promise<string[]> {
  const out: string[] = [];
  let id: string | null = placeId;
  for (let depth = 0; id && depth < 8; depth++) {
    const p: { parentId: string | null } | null = await db.place.findUnique({ where: { id }, select: { parentId: true } });
    if (!p?.parentId) break;
    out.push(p.parentId);
    id = p.parentId;
  }
  return out;
}

/** Other places under the same parent: "nearby" without pretending to know distances we have not measured. */
async function siblings(placeId: string): Promise<string[]> {
  const me = await db.place.findUnique({ where: { id: placeId }, select: { parentId: true } });
  if (!me?.parentId) return [];
  const rows = await db.place.findMany({ where: { parentId: me.parentId, id: { not: placeId } }, select: { id: true } });
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------- candidates

const BASE = { published: true, isSample: false } as const;

/**
 * Who could take this job at each stage, in the order the stages are tried.
 *
 * A business found at an earlier stage is not offered again at a later one: the stage recorded against an
 * assignment is the strongest claim that business had to the work.
 */
async function candidatesByStage(categoryId: string, placeId: string) {
  const chain = await ancestors(placeId);
  const [parent, ...wider] = chain;
  const near = await siblings(placeId);
  const seen = new Set<string>();

  const query = async (where: object) => {
    const rows = await db.business.findMany({
      where: { ...BASE, categories: { some: { categoryId } }, ...where },
      select: { id: true, name: true },
    });
    const fresh = rows.filter((r) => !seen.has(r.id));
    for (const r of fresh) seen.add(r.id);
    return fresh;
  };

  return {
    EXACT: await query({ serviceAreas: { some: { placeId } } }),
    PARENT: parent ? await query({ serviceAreas: { some: { placeId: parent, mode: "INCLUDES_CHILDREN" } } }) : [],
    ADMIN_AREA: wider.length ? await query({ serviceAreas: { some: { placeId: { in: wider }, mode: "INCLUDES_CHILDREN" } } }) : [],
    // Stage four reaches nobody until a business has said yes to work outside the areas it named.
    NEARBY: near.length ? await query({ acceptsNearby: true, serviceAreas: { some: { placeId: { in: near } } } }) : [],
  } as Record<Stage, { id: string; name: string }[]>;
}

/**
 * Round-robin order among equally eligible businesses.
 *
 * Fewest assignments first, then whoever has waited longest, then by id so the order is deterministic and a
 * test can rely on it. Without this, the business that happens to sort first takes every job in its area.
 */
async function fairOrder(businesses: { id: string; name: string }[]) {
  if (businesses.length < 2) return businesses;
  const ids = businesses.map((b) => b.id);
  const stats = await db.leadAssignment.groupBy({
    by: ["businessId"],
    where: { businessId: { in: ids }, status: { not: "REVERSED" } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const by = new Map(stats.map((s) => [s.businessId, { n: s._count._all, last: s._max.createdAt?.getTime() ?? 0 }]));
  return [...businesses].sort((a, b) => {
    const x = by.get(a.id) ?? { n: 0, last: 0 };
    const y = by.get(b.id) ?? { n: 0, last: 0 };
    return x.n - y.n || x.last - y.last || a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------- claiming a slot

type Claim =
  | { ok: true; assignment: { id: string; paidSlot: number | null } }
  | { ok: false; why: "full" | "already" | "contended" };

/**
 * Takes one of the two paid slots, or fails.
 *
 * The insert is the decision. Reading the free slots first is only an optimisation: if two runs read the
 * same free slot, the partial unique index refuses the second, and that is the point of having it.
 */
async function claimSlot(jobRequestId: string, businessId: string, stage: Stage | "MANUAL", reason: string, assignedById?: string | null): Promise<Claim> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const taken = await db.leadAssignment.findMany({
      where: { jobRequestId, paidSlot: { not: null } }, select: { paidSlot: true },
    });
    const free = SLOTS.find((s) => !taken.some((t) => t.paidSlot === s));
    if (!free) return { ok: false, why: "full" };

    try {
      const assignment = await db.leadAssignment.create({
        data: { jobRequestId, businessId, kind: "PAID", paidSlot: free, stage, reason, assignedById: assignedById ?? null },
        select: { id: true, paidSlot: true },
      });
      return { ok: true, assignment };
    } catch {
      // Either this business already holds the job, or another run took the slot between the read and the
      // write. The first is final; the second is worth retrying. A REVERSED row is not a live claim, so it
      // does not count — a business taken off a job can be given it again.
      const already = await db.leadAssignment.findFirst({
        where: { jobRequestId, businessId, status: { not: "REVERSED" } }, select: { id: true },
      });
      if (already) return { ok: false, why: "already" };
    }
  }
  return { ok: false, why: "contended" };
}

// ---------------------------------------------------------------- the run

export type MatchResult = {
  runId: string;
  reference: string;
  assigned: { businessId: string; name: string; stage: Stage; slot: number | null }[];
  status: string;
  /** Slots that were already filled when this run started. A re-run is not a failure. */
  alreadyFilled: number;
  considered: number;
};

/**
 * Matches one job request. Idempotent, re-runnable, and never double-charging.
 */
export async function matchJobRequest(jobRequestId: string): Promise<MatchResult> {
  const runId = randomUUID();
  const job = await db.jobRequest.findUnique({
    where: { id: jobRequestId },
    include: { category: { select: { id: true, name: true } }, place: { select: { id: true, label: true } } },
  });
  if (!job) throw new Error("No such job request");

  const result: MatchResult = { runId, reference: job.reference, assigned: [], status: job.status, alreadyFilled: 0, considered: 0 };

  if (job.status === "CLOSED" || job.status === "REJECTED") {
    await record(job.id, runId, { stage: "RUN", outcome: "SKIPPED", reason: `The request is ${job.status.toLowerCase()}; matching does not run on it.` });
    return result;
  }

  const existing = await db.leadAssignment.findMany({
    where: { jobRequestId: job.id, status: { not: "REVERSED" } },
    select: { businessId: true, paidSlot: true, kind: true },
  });
  const held = new Set(existing.map((e) => e.businessId));
  result.alreadyFilled = existing.filter((e) => e.paidSlot !== null).length;

  if (result.alreadyFilled >= MAX_PAID) {
    await record(job.id, runId, { stage: "RUN", outcome: "SKIPPED", reason: `Both paid places were already filled. Nothing to do, and nothing charged.` });
    return result;
  }

  const byStage = await candidatesByStage(job.category.id, job.place.id);
  let filled = result.alreadyFilled;

  for (const stage of STAGES) {
    // Deliberately not a `break`. A business that was never reached is still owed an answer, so the
    // remaining stages are walked and each candidate gets a row saying the places had already gone.
    // Without this, "why did I not get that job?" has no answer for exactly the businesses most likely
    // to ask — the ones who were next in line.
    if (filled >= MAX_PAID) {
      for (const business of byStage[stage]) {
        if (held.has(business.id)) continue;
        await record(job.id, runId, { businessId: business.id, stage, outcome: "SKIPPED", reason: "Both paid places were filled by an earlier stage, so they were not reached." });
      }
      continue;
    }
    const ordered = await fairOrder(byStage[stage]);
    if (ordered.length === 0) {
      await record(job.id, runId, { stage, outcome: "SKIPPED", reason: `No business ${STAGE_WORDS[stage]} and offers ${job.category.name.toLowerCase()}.` });
      continue;
    }

    for (const business of ordered) {
      if (filled >= MAX_PAID) {
        await record(job.id, runId, { businessId: business.id, stage, outcome: "SKIPPED", reason: "Both paid places were taken before we reached them." });
        continue;
      }
      result.considered++;

      if (held.has(business.id)) {
        await record(job.id, runId, { businessId: business.id, stage, outcome: "SKIPPED", reason: "They already have this job." });
        continue;
      }

      // A cheap check first, so a business with no credits is excluded with a clear reason rather than by
      // a failed charge. The authoritative check is still the conditional update inside spendCredits.
      const account = await db.creditAccount.findUnique({ where: { businessId: business.id }, select: { balance: true } });
      if ((account?.balance ?? 0) < 1) {
        await record(job.id, runId, { businessId: business.id, stage, outcome: "EXCLUDED", reason: "No lead credits. They keep their listing; they do not get the job." });
        continue;
      }

      const claim = await claimSlot(job.id, business.id, stage, `They ${STAGE_WORDS[stage]} and offer ${job.category.name.toLowerCase()}.`);
      if (!claim.ok) {
        const why = claim.why === "full"
          ? "Both paid places were taken by the time we tried."
          : claim.why === "already" ? "They already have this job."
          : "Two runs contended for the same place and this one gave way.";
        await record(job.id, runId, { businessId: business.id, stage, outcome: claim.why === "already" ? "SKIPPED" : "EXCLUDED", reason: why });
        if (claim.why === "full") break;
        continue;
      }

      const spent = await spendCredits(business.id, 1, `Lead ${job.reference}`, claim.assignment.id);
      if (!spent.ok) {
        // Their last credit went elsewhere between the check and the charge. Remove the assignment so the
        // place is free for somebody who can pay — never leave a row that looks assigned but was not paid.
        await db.leadAssignment.delete({ where: { id: claim.assignment.id } });
        await record(job.id, runId, { businessId: business.id, stage, outcome: "EXCLUDED", reason: "Their last credit was spent elsewhere before we could charge it, so the place was released." });
        continue;
      }

      await db.leadAssignment.update({ where: { id: claim.assignment.id }, data: { creditCharged: true } });
      held.add(business.id);
      filled++;
      result.assigned.push({ businessId: business.id, name: business.name, stage, slot: claim.assignment.paidSlot });
      await record(job.id, runId, { businessId: business.id, stage, outcome: "ASSIGNED", reason: `Assigned, one credit charged. They ${STAGE_WORDS[stage]}.` });
    }
  }

  const status = filled >= MAX_PAID ? "ASSIGNED" : filled > 0 ? "PARTIALLY_ASSIGNED" : "UNASSIGNED";
  await db.jobRequest.update({ where: { id: job.id }, data: { status } });
  result.status = status;

  await record(job.id, runId, {
    stage: "RUN", outcome: filled > result.alreadyFilled ? "ASSIGNED" : "SKIPPED",
    reason: `Considered ${result.considered}; ${filled} of ${MAX_PAID} places filled; request is now ${status.toLowerCase().replace("_", " ")}.`,
  });

  if (result.assigned.length) {
    await audit({
      action: "Lead assigned", targetType: "JobRequest", targetId: job.id,
      detail: `${job.reference} to ${result.assigned.map((a) => a.name).join(" and ")} (${result.assigned.length} credit(s) charged)`,
    }, { kind: "SYSTEM" });
  }

  return result;
}

/** Re-runs matching for everything still waiting. Safe to call repeatedly; nothing is charged twice. */
export async function matchPending(limit = 50) {
  const waiting = await db.jobRequest.findMany({
    where: { status: { in: ["NEW", "MATCHING", "PARTIALLY_ASSIGNED", "UNASSIGNED"] } },
    orderBy: { createdAt: "asc" }, take: limit, select: { id: true },
  });
  const results = [];
  for (const w of waiting) results.push(await matchJobRequest(w.id));
  return results;
}

// ---------------------------------------------------------------- by hand

/**
 * An administrator assigning a job themselves.
 *
 * `SPONSORED` costs the business nothing and takes no paid place, which is what makes it usable for a
 * goodwill gesture or for getting a new business its first job. `PAID` goes through exactly the same slot
 * claim as the matcher, so the limit holds whoever is doing the assigning.
 */
export async function assignManually(
  jobRequestId: string,
  businessId: string,
  opts: { kind: "PAID" | "SPONSORED"; reason: string; adminId: string | null },
) {
  const runId = randomUUID();
  if (opts.reason.trim().length < 5) return { ok: false as const, message: "Give a reason the business could be shown." };

  const [job, business] = await Promise.all([
    db.jobRequest.findUnique({ where: { id: jobRequestId }, select: { id: true, reference: true, status: true } }),
    db.business.findUnique({ where: { id: businessId }, select: { id: true, name: true, published: true } }),
  ]);
  if (!job || !business) return { ok: false as const, message: "That job or business no longer exists." };
  if (job.status === "CLOSED") return { ok: false as const, message: "That request is closed. Reopen it first." };

  if (opts.kind === "SPONSORED") {
    try {
      const assignment = await db.leadAssignment.create({
        data: { jobRequestId: job.id, businessId, kind: "SPONSORED", paidSlot: null, stage: "MANUAL", reason: opts.reason.trim(), assignedById: opts.adminId },
      });
      await record(job.id, runId, { businessId, stage: "MANUAL", outcome: "ASSIGNED", reason: `Sponsored by an administrator, no credit charged: ${opts.reason.trim()}` });
      await audit({ action: "Lead assigned by hand (sponsored)", targetType: "JobRequest", targetId: job.id, detail: `${job.reference} to ${business.name}: ${opts.reason.trim()}` });
      await bumpStatus(job.id);
      return { ok: true as const, assignmentId: assignment.id, charged: false };
    } catch {
      return { ok: false as const, message: `${business.name} already has this job.` };
    }
  }

  const claim = await claimSlot(job.id, businessId, "MANUAL", opts.reason.trim(), opts.adminId);
  if (!claim.ok) {
    const message = claim.why === "already" ? `${business.name} already has this job.`
      : claim.why === "full" ? `Both paid places are taken. Reverse one first, or assign this as sponsored.`
      : "Something else was assigning at the same moment. Try again.";
    await record(job.id, runId, { businessId, stage: "MANUAL", outcome: "EXCLUDED", reason: message });
    return { ok: false as const, message };
  }

  const spent = await spendCredits(businessId, 1, `Lead ${job.reference} (assigned by hand)`, claim.assignment.id);
  if (!spent.ok) {
    await db.leadAssignment.delete({ where: { id: claim.assignment.id } });
    await record(job.id, runId, { businessId, stage: "MANUAL", outcome: "EXCLUDED", reason: "They have no credits, so the place was released rather than given away as paid." });
    return { ok: false as const, message: `${business.name} has no lead credits. Give them some, or assign this as sponsored.` };
  }

  await db.leadAssignment.update({ where: { id: claim.assignment.id }, data: { creditCharged: true } });
  await record(job.id, runId, { businessId, stage: "MANUAL", outcome: "ASSIGNED", reason: `Assigned by an administrator, one credit charged: ${opts.reason.trim()}` });
  await audit({ action: "Lead assigned by hand", targetType: "JobRequest", targetId: job.id, detail: `${job.reference} to ${business.name}: ${opts.reason.trim()}` });
  await bumpStatus(job.id);
  return { ok: true as const, assignmentId: claim.assignment.id, charged: true };
}

/**
 * Takes an assignment back.
 *
 * Refunds the credit where one was charged, frees the paid place, and leaves the row behind as `REVERSED`
 * with its reason. A business that loses a job it paid for should be able to see that it happened.
 */
export async function reverseAssignment(assignmentId: string, reason: string) {
  const a = await db.leadAssignment.findUnique({
    where: { id: assignmentId },
    include: { jobRequest: { select: { id: true, reference: true } }, business: { select: { name: true } } },
  });
  if (!a) return { ok: false as const, message: "That assignment no longer exists." };
  if (a.status === "REVERSED") return { ok: false as const, message: "It has already been reversed." };
  if (reason.trim().length < 5) return { ok: false as const, message: "Give a reason the business could be shown." };

  // The paid place is freed in the same update that marks it reversed, so nothing can take the credit back
  // while the slot still looks occupied.
  await db.leadAssignment.update({
    where: { id: assignmentId },
    data: { status: "REVERSED", paidSlot: null, failedReason: reason.trim() },
  });
  if (a.creditCharged) {
    await reverseCredits(a.businessId, 1, `Lead ${a.jobRequest.reference} reversed: ${reason.trim()}`, a.id);
    await db.leadAssignment.update({ where: { id: assignmentId }, data: { creditCharged: false } });
  }
  await record(a.jobRequestId, randomUUID(), { businessId: a.businessId, stage: "MANUAL", outcome: "EXCLUDED", reason: `Reversed: ${reason.trim()}` });
  await audit({
    action: "Lead assignment reversed", targetType: "JobRequest", targetId: a.jobRequestId,
    detail: `${a.jobRequest.reference} from ${a.business.name}${a.creditCharged ? ", credit refunded" : ", nothing to refund"}: ${reason.trim()}`,
  });
  await bumpStatus(a.jobRequestId);
  return { ok: true as const, refunded: a.creditCharged };
}

/** Keeps the request's status in step with how many paid places are filled. */
async function bumpStatus(jobRequestId: string) {
  const job = await db.jobRequest.findUnique({ where: { id: jobRequestId }, select: { status: true } });
  if (!job || job.status === "CLOSED" || job.status === "REJECTED") return;
  const live = await db.leadAssignment.findMany({
    where: { jobRequestId, status: { not: "REVERSED" } }, select: { paidSlot: true },
  });
  const paid = live.filter((l) => l.paidSlot !== null).length;
  const status = paid >= MAX_PAID ? "ASSIGNED" : live.length > 0 ? "PARTIALLY_ASSIGNED" : "UNASSIGNED";
  await db.jobRequest.update({ where: { id: jobRequestId }, data: { status } });
}

/** The business has opened the job. Recorded so "they were sent it and never looked" is a fact, not a guess. */
export async function markDelivered(assignmentId: string) {
  const a = await db.leadAssignment.findUnique({ where: { id: assignmentId }, select: { status: true, deliveredAt: true } });
  if (!a || a.deliveredAt || a.status === "REVERSED") return;
  await db.leadAssignment.update({ where: { id: assignmentId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
}

// ---------------------------------------------------------------- reading

export const assignmentsFor = (jobRequestId: string) =>
  db.leadAssignment.findMany({
    where: { jobRequestId },
    orderBy: [{ paidSlot: "asc" }, { createdAt: "asc" }],
    include: { business: { select: { id: true, name: true, slug: true, phone: true } } },
  });

export const decisionsFor = (jobRequestId: string) =>
  db.matchDecision.findMany({
    where: { jobRequestId },
    orderBy: { createdAt: "asc" },
    include: { business: { select: { name: true } } },
  });

/** Jobs assigned to one business, newest first. What the owner dashboard shows. */
export const assignmentsForBusiness = (businessId: string, take = 50) =>
  db.leadAssignment.findMany({
    where: { businessId, status: { not: "REVERSED" } },
    orderBy: { createdAt: "desc" }, take,
    include: { jobRequest: { include: { category: { select: { name: true } }, place: { select: { label: true } } } } },
  });

/**
 * Does every charged assignment have a ledger row, and vice versa?
 *
 * The one failure this cannot prevent is a crash between the successful charge and the flag being set. It
 * can, however, be found — so it is, rather than being left to turn up in a dispute.
 */
export async function reconcileAssignments() {
  const rows = await db.leadAssignment.findMany({
    where: { kind: "PAID" }, select: { id: true, businessId: true, creditCharged: true, status: true },
  });
  const ledger = await db.creditTransaction.findMany({
    where: { kind: "CONSUMPTION", assignmentId: { in: rows.map((r) => r.id) } },
    select: { assignmentId: true },
  });
  const charged = new Set(ledger.map((l) => l.assignmentId));
  const reversals = await db.creditTransaction.findMany({
    where: { kind: "REVERSAL", assignmentId: { in: rows.map((r) => r.id) } }, select: { assignmentId: true },
  });
  const refunded = new Set(reversals.map((r) => r.assignmentId));

  const flaggedButNotCharged = rows.filter((r) => r.creditCharged && !charged.has(r.id));
  const chargedButNotFlagged = rows.filter((r) => !r.creditCharged && charged.has(r.id) && !refunded.has(r.id));
  return { total: rows.length, flaggedButNotCharged, chargedButNotFlagged, agrees: flaggedButNotCharged.length === 0 && chargedButNotFlagged.length === 0 };
}
