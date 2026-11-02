/**
 * Phase 4 (`admin-dashboard-audit.md`) — lead-generation analytics.
 *
 * `src/lib/lead-analytics.ts` reads `JobRequest`/`LeadAssignment`/`MatchDecision`/`CreditTransaction`/
 * `Order` and must not double-count or misattribute anything already proven correct by
 * `test-leads.ts`/`test-matching.ts`/`test-credit-purchase.ts`. This suite only checks the aggregation,
 * using before/after deltas (whole-table aggregates are not scoped to this suite's own fixtures — see
 * /memories/repo/primestreet-notes.md).
 */
import { PrismaClient } from "@prisma/client";
import { creditAccount, CREDIT_PRODUCT_KEY } from "../src/lib/credits";
import { createJobRequest, type JobInput } from "../src/lib/leads";
import { matchJobRequest } from "../src/lib/matching";
import { recordResponse } from "../src/lib/lead-response";
import { creditsSummary, jobFunnel, matchDecisionBreakdown, responseStats } from "../src/lib/lead-analytics";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const MARK = "test-lead-analytics-suite";
const SLUG = "lead-analytics-suite-";

async function cleanup() {
  const jobs = await db.jobRequest.findMany({ where: { ipHash: MARK }, select: { id: true } });
  const ids = jobs.map((j) => j.id);
  if (ids.length) {
    await db.matchDecision.deleteMany({ where: { jobRequestId: { in: ids } } });
    await db.leadAssignment.deleteMany({ where: { jobRequestId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { targetType: "JobRequest", targetId: { in: ids } } });
    await db.jobRequest.deleteMany({ where: { id: { in: ids } } });
  }
  const biz = await db.business.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const bids = biz.map((b) => b.id);
  if (bids.length) {
    await db.order.deleteMany({ where: { businessId: { in: bids } } });
    await db.matchDecision.deleteMany({ where: { businessId: { in: bids } } });
    await db.leadAssignment.deleteMany({ where: { businessId: { in: bids } } });
    await db.creditTransaction.deleteMany({ where: { businessId: { in: bids } } });
    await db.creditAccount.deleteMany({ where: { businessId: { in: bids } } });
    await db.businessServiceArea.deleteMany({ where: { businessId: { in: bids } } });
    await db.businessCategory.deleteMany({ where: { businessId: { in: bids } } });
    await db.auditLog.deleteMany({ where: { targetType: "Business", targetId: { in: bids } } });
    await db.business.deleteMany({ where: { id: { in: bids } } });
  }
}

let jobSeq = 0;
async function job(categoryId: string, placeId: string) {
  const input: JobInput = {
    name: "Lead Analytics Suite Customer", email: `lead-analytics-suite-${++jobSeq}@example.test`, phone: "020 7946 0000",
    categoryId, placeId, postcode: "E8 3AA",
    description: `A fixture job created by the lead-analytics suite, number ${jobSeq}, long enough to validate.`,
    urgency: "FLEXIBLE", marketingOptIn: false,
  };
  const { request } = await createJobRequest(input, MARK);
  return request;
}

async function main() {
  await cleanup();

  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } });
  if (!borough) throw new Error("Hackney is missing from the place tree");
  const locals = await db.place.findMany({ where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, take: 1 });
  if (locals.length < 1) throw new Error("Hackney needs at least one locality");
  const here = locals[0];
  const trade = (await db.category.findFirst({ where: { slug: "plumbing" } }))!;
  const other = (await db.category.findFirst({ where: { slug: "roofing" } }))!;

  const any = (await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } }))!;
  const biz = await db.business.create({
    data: {
      name: "Lead Analytics Suite Trader", slug: `${SLUG}1`,
      summary: "A fixture, created and removed by scripts/test-lead-analytics.ts.",
      description: "A fixture, created and removed by scripts/test-lead-analytics.ts.",
      categoryId: trade.id, locationId: any.locationId, cityId: any.cityId,
      published: true, isSample: false,
    },
  });
  await db.businessCategory.create({ data: { businessId: biz.id, categoryId: trade.id, isPrimary: true } });
  await db.businessServiceArea.create({ data: { businessId: biz.id, placeId: here.id, mode: "EXACT" } });
  await creditAccount(biz.id);

  const from = new Date(Date.now() - 60_000); // a minute ago, so everything we create falls inside [from, to)

  // ---------------------------------------------------------- baselines, captured before any fixture exists
  const baseFunnel = await jobFunnel(from, new Date());
  const baseCredits = await creditsSummary(from, new Date());
  const baseResponses = await responseStats(from, new Date());

  // ---------------------------------------------------------- jobFunnel
  const unserviced = await job(other.id, here.id); // nobody covers roofing here: UNASSIGNED, no supply
  await db.order.create({ data: { businessId: biz.id, productKey: CREDIT_PRODUCT_KEY, quantity: 10, amountPence: 1000, source: "CHECKOUT", status: "PAID", paidAt: new Date() } });
  await db.creditAccount.update({ where: { businessId: biz.id }, data: { balance: { increment: 10 } } });
  await db.creditTransaction.create({ data: { accountId: (await creditAccount(biz.id)).id, businessId: biz.id, delta: 10, balanceAfter: 10, kind: "PURCHASE", reason: "fixture purchase", orderId: null } });

  const serviced = await job(trade.id, here.id); // our fixture trader covers plumbing here: gets assigned
  const run = await matchJobRequest(serviced.id);
  t("fixture job was assigned to the fixture trader", run.assigned.length === 1 && run.assigned[0].businessId === biz.id);

  const to = new Date();
  const funnel = await jobFunnel(from, to);
  t("jobFunnel: submitted grows by exactly the 2 fixture jobs", funnel.submitted === baseFunnel.submitted + 2);
  t("jobFunnel: withoutSupply grows by exactly the 1 unserviced job", funnel.withoutSupply === baseFunnel.withoutSupply + 1);
  t("jobFunnel: assigned grows by exactly the 1 serviced job", funnel.assigned === baseFunnel.assigned + 1);

  // ---------------------------------------------------------- responseStats
  const assignmentRow = await db.leadAssignment.findFirstOrThrow({ where: { jobRequestId: serviced.id, businessId: biz.id } });
  const result = await recordResponse(assignmentRow.id, "CALLED");
  t("recordResponse accepted the fixture's response", result.ok === true);
  const responses = await responseStats(from, to);
  t("responseStats: assignmentsCreated grows by exactly 1", responses.assignmentsCreated === baseResponses.assignmentsCreated + 1);
  t("responseStats: called grows by exactly 1", responses.called === baseResponses.called + 1);
  t("responseStats: responded grows by exactly 1", responses.responded === baseResponses.responded + 1);

  // ---------------------------------------------------------- creditsSummary
  const credits = await creditsSummary(from, to);
  t("creditsSummary: purchasedCredits grows by exactly the 10-credit fixture purchase", credits.purchasedCredits === baseCredits.purchasedCredits + 10);
  t("creditsSummary: spentCredits grows by exactly the 1 credit the match spent", credits.spentCredits === baseCredits.spentCredits + 1);
  t("creditsSummary: purchaseRevenuePence grows by exactly the fixture order's amount (no VAT)", credits.purchaseRevenuePence === baseCredits.purchaseRevenuePence + 1000);

  // ---------------------------------------------------------- matchDecisionBreakdown
  const decisions = await matchDecisionBreakdown(from, to);
  t("matchDecisionBreakdown: at least one ASSIGNED row recorded in range", decisions.some((d) => d.outcome === "ASSIGNED" && d.count > 0));
  t("matchDecisionBreakdown: at least one SKIPPED row recorded (the unserviced job)", decisions.some((d) => d.outcome === "SKIPPED" && d.count > 0));

  await cleanup();
  console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
