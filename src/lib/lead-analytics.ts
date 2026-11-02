import { db } from "./db";
import { CREDIT_PRODUCT_KEY, LOW_BALANCE_THRESHOLD } from "./credits";
import { demandWithoutSupply } from "./leads";

/**
 * Metrics for the Phase 4 lead-generation analytics module (`/admin/leads-analytics`).
 *
 * `admin-dashboard-audit.md` originally deferred Phase 4 on the grounds that the lead-credit system was
 * "designed, not built — zero code, zero schema" (per `docs/leadgen/MASTER_PLAN.md` at the time). That has
 * since changed: `JobRequest`, `LeadAssignment`, `MatchDecision`, `CreditAccount` and `CreditTransaction` now
 * exist and are exercised by `scripts/test-leads.ts`, `test-matching.ts`, `test-lead-response.ts` and
 * `test-credit-purchase.ts`. This file reads those tables; it creates none, and the operational
 * `/admin/leads` queue (`src/lib/leads.ts`'s `leadCounts`/`demandWithoutSupply`) is reused rather than
 * duplicated.
 *
 * Deliberate limitation, disclosed on the page: this is `dev`-schema data only. Production's `Place` and
 * `JobRequest` tables are empty (the geography import has not been authorised), so every figure here is
 * about the system working correctly in `dev`, not about real customer demand — the page says so rather
 * than implying otherwise.
 */

export { demandWithoutSupply };

export type JobFunnel = {
  submitted: number;
  withSupply: number;
  withoutSupply: number;
  assigned: number;
  closed: number;
  rejected: number;
};

/** Submitted → had supply at all → actually assigned to a business, for the requests created in range. */
export async function jobFunnel(from: Date, to: Date): Promise<JobFunnel> {
  const jobs = await db.jobRequest.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { id: true, providersAtCreation: true, status: true },
  });
  const ids = jobs.map((j) => j.id);
  const assignedIds = ids.length
    ? new Set((await db.leadAssignment.findMany({ where: { jobRequestId: { in: ids }, status: { not: "REVERSED" } }, select: { jobRequestId: true } })).map((a) => a.jobRequestId))
    : new Set<string>();
  return {
    submitted: jobs.length,
    withSupply: jobs.filter((j) => j.providersAtCreation > 0).length,
    withoutSupply: jobs.filter((j) => j.providersAtCreation === 0).length,
    assigned: jobs.filter((j) => assignedIds.has(j.id)).length,
    closed: jobs.filter((j) => j.status === "CLOSED").length,
    rejected: jobs.filter((j) => j.status === "REJECTED").length,
  };
}

export type ResponseStats = {
  assignmentsCreated: number;
  delivered: number;
  responded: number;
  called: number;
  declined: number;
  noResponseYet: number;
};

/**
 * What happened to paid assignments created in range: did the business open it, and — the fact that
 * actually matters, per `src/lib/lead-response.ts` — did they say they called the customer, or decline.
 * Sponsored assignments are excluded: nothing was charged for them, so a response rate against them would
 * mix a free placement in with the product being measured.
 */
export async function responseStats(from: Date, to: Date): Promise<ResponseStats> {
  const rows = await db.leadAssignment.findMany({
    where: { createdAt: { gte: from, lt: to }, kind: "PAID" },
    select: { deliveredAt: true, respondedAt: true, responseKind: true },
  });
  const responded = rows.filter((r) => r.respondedAt).length;
  return {
    assignmentsCreated: rows.length,
    delivered: rows.filter((r) => r.deliveredAt).length,
    responded,
    called: rows.filter((r) => r.responseKind === "CALLED").length,
    declined: rows.filter((r) => r.responseKind === "DECLINED").length,
    noResponseYet: rows.length - responded,
  };
}

export type CreditsSummary = {
  purchasedCredits: number;
  purchaseRevenuePence: number;
  spentCredits: number;
  welcomeGrantsGiven: number;
  welcomeCreditsGiven: number;
  reversedCredits: number;
  /** A live snapshot (not range-bound): how many accounts are at or below the low-balance threshold right now. */
  lowOrZeroBalanceBusinesses: number;
};

/** Credits bought, spent and reversed in range, cross-checked against `CreditTransaction`, the ledger of record. */
export async function creditsSummary(from: Date, to: Date): Promise<CreditsSummary> {
  const [orders, spentTx, grantTx, reversalTx, lowAccounts] = await Promise.all([
    db.order.findMany({ where: { status: "PAID", productKey: CREDIT_PRODUCT_KEY, paidAt: { gte: from, lt: to } }, select: { quantity: true, amountPence: true, vatPence: true } }),
    db.creditTransaction.findMany({ where: { kind: "CONSUMPTION", createdAt: { gte: from, lt: to } }, select: { delta: true } }),
    db.creditTransaction.findMany({ where: { kind: "FREE_GRANT", createdAt: { gte: from, lt: to } }, select: { delta: true } }),
    db.creditTransaction.findMany({ where: { kind: "REVERSAL", createdAt: { gte: from, lt: to } }, select: { delta: true } }),
    db.creditAccount.count({ where: { balance: { lte: LOW_BALANCE_THRESHOLD } } }),
  ]);
  return {
    purchasedCredits: orders.reduce((a, o) => a + o.quantity, 0),
    purchaseRevenuePence: orders.reduce((a, o) => a + (o.amountPence - o.vatPence), 0),
    spentCredits: spentTx.reduce((a, t) => a + Math.abs(t.delta), 0),
    welcomeGrantsGiven: grantTx.length,
    welcomeCreditsGiven: grantTx.reduce((a, t) => a + t.delta, 0),
    reversedCredits: reversalTx.reduce((a, t) => a + t.delta, 0),
    lowOrZeroBalanceBusinesses: lowAccounts,
  };
}

export type MatchStageRow = { stage: string; outcome: string; count: number };

/** Every `MatchDecision` in range, grouped — the "why" behind the funnel above, at the level the brief asked for. */
export async function matchDecisionBreakdown(from: Date, to: Date): Promise<MatchStageRow[]> {
  const rows = await db.matchDecision.groupBy({
    by: ["stage", "outcome"],
    where: { createdAt: { gte: from, lt: to } },
    _count: true,
  });
  return rows.map((r) => ({ stage: r.stage, outcome: r.outcome, count: r._count })).sort((a, b) => b.count - a.count);
}
