/**
 * What a business covers, and whether it can change it.
 *
 * The reason this suite matters: these three fields — areas, trades and the nearby opt-in — are the only
 * things matching routes on. If a business cannot correct them, the matcher is routing on data that is
 * quietly going stale, and the failure is invisible: jobs simply go elsewhere.
 *
 * So the checks are not only "does it save". They are: does a change take effect in the matcher
 * immediately, and can a business make itself unreachable by accident.
 */
import { PrismaClient } from "@prisma/client";
import { COVERED_BOROUGHS, coverageOptions, currentCoverage, demandInCoverage, saveCoverage, validateCoverage } from "../src/lib/coverage";
import { creditAccount } from "../src/lib/credits";
import { createJobRequest, providersFor, type JobInput } from "../src/lib/leads";
import { matchJobRequest } from "../src/lib/matching";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const MARK = "test-coverage-suite";
const SLUG = "coverage-suite-";

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
    await db.matchDecision.deleteMany({ where: { businessId: { in: bids } } });
    await db.leadAssignment.deleteMany({ where: { businessId: { in: bids } } });
    await db.creditTransaction.deleteMany({ where: { businessId: { in: bids } } });
    await db.creditAccount.deleteMany({ where: { businessId: { in: bids } } });
    await db.businessServiceArea.deleteMany({ where: { businessId: { in: bids } } });
    await db.businessCategory.deleteMany({ where: { businessId: { in: bids } } });
    await db.businessEditLog.deleteMany({ where: { businessId: { in: bids } } });
    await db.auditLog.deleteMany({ where: { targetType: "Business", targetId: { in: bids } } });
    await db.business.deleteMany({ where: { id: { in: bids } } });
  }
}

let seq = 0;
async function job(categoryId: string, placeId: string) {
  const input: JobInput = {
    name: "Coverage Suite Customer", email: `coverage-suite-${++seq}@example.test`, phone: "020 7946 0000",
    categoryId, placeId, description: `A fixture job from the coverage suite, number ${seq}, long enough to validate.`,
    urgency: "FLEXIBLE", marketingOptIn: false,
  };
  return (await createJobRequest(input, MARK)).request;
}

async function main() {
  await cleanup();

  // ---------------- the options the forms offer
  const boroughs = await coverageOptions();
  t("every covered borough is offered", boroughs.length === COVERED_BOROUGHS.length, `${boroughs.length} of ${COVERED_BOROUGHS.length}`);
  t("…in alphabetical order, so the list does not shuffle between pages",
    boroughs.every((b, i, a) => i === 0 || a[i - 1].name.localeCompare(b.name) <= 0));
  t("…each with its localities", boroughs.every((b) => Array.isArray(b.localities)));
  t("…and at least one borough really has some", boroughs.some((b) => b.localities.length > 0));

  const hackney = boroughs.find((b) => b.name === "Hackney")!;
  const havering = boroughs.find((b) => b.name === "Havering")!;
  const local = hackney.localities[0];
  const otherLocal = hackney.localities[1];
  const trade = (await db.category.findFirst({ where: { slug: "plumbing" } }))!;
  const other = (await db.category.findFirst({ where: { slug: "roofing" } }))!;

  const any = (await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } }))!;
  const biz = await db.business.create({
    data: {
      name: "Coverage Suite Trader", slug: `${SLUG}1`,
      summary: "A fixture, created and removed by scripts/test-coverage.ts.",
      description: "A fixture, created and removed by scripts/test-coverage.ts.",
      categoryId: trade.id, locationId: any.locationId, cityId: any.cityId, published: true, isSample: false,
    },
  });
  await db.businessCategory.create({ data: { businessId: biz.id, categoryId: trade.id, isPrimary: true } });
  await db.businessServiceArea.create({ data: { businessId: biz.id, placeId: local.id, mode: "EXACT" } });
  await creditAccount(biz.id);
  await db.creditAccount.update({ where: { businessId: biz.id }, data: { balance: 10 } });

  // ---------------- what is there now
  const start = await currentCoverage(biz.id);
  t("current coverage reads back what was set", start.areaIds.length === 1 && start.areaIds[0] === local.id);
  t("…with the trade", start.categoryIds.length === 1 && start.categoryIds[0] === trade.id);
  t("…its main trade", start.primaryCategoryId === trade.id);
  t("…and nearby work off, because nobody asked for it", start.acceptsNearby === false);

  // ---------------- validation refuses what would make them unreachable
  const empty = await validateCoverage({ areaIds: [], categoryIds: [trade.id], acceptsNearby: false });
  t("no areas is refused", empty.some((p) => p.field === "areaIds"));
  t("…with a reason that says why it matters", /no job can ever reach you/i.test(empty[0].message));
  const noTrade = await validateCoverage({ areaIds: [local.id], categoryIds: [], acceptsNearby: false });
  t("no trades is refused", noTrade.some((p) => p.field === "categoryIds"));

  const outside = await db.place.findFirst({ where: { kind: { in: ["TOWN", "SUBURB", "LOCALITY"] }, parentId: { notIn: boroughs.map((b) => b.id) } } });
  const smuggled = await validateCoverage({ areaIds: [local.id, outside!.id], categoryIds: [trade.id], acceptsNearby: false });
  t("an area outside the covered boroughs is refused, not merely hidden", smuggled.some((p) => p.field === "areaIds"),
    "the form offers seven boroughs; editing its values must not grant coverage of somewhere else");
  const madeUp = await validateCoverage({ areaIds: [local.id], categoryIds: ["not-a-category"], acceptsNearby: false });
  t("a trade we do not list is refused", madeUp.some((p) => p.field === "categoryIds"));

  const before = await currentCoverage(biz.id);
  const refused = await saveCoverage(biz.id, { areaIds: [], categoryIds: [], acceptsNearby: false });
  t("a refused save changes nothing at all", !refused.ok &&
    (await currentCoverage(biz.id)).areaIds.length === before.areaIds.length);

  // ---------------- a borough-wide choice means the whole borough
  const widened = await saveCoverage(biz.id, { areaIds: [hackney.id], categoryIds: [trade.id], acceptsNearby: false });
  t("choosing a borough saves", widened.ok);
  const areas = await db.businessServiceArea.findMany({ where: { businessId: biz.id } });
  t("…as INCLUDES_CHILDREN, derived from the kind of place", areas.length === 1 && areas[0].mode === "INCLUDES_CHILDREN");
  t("…and it reaches a locality inside it, which is what the matcher walks", (await providersFor(trade.id, local.id)) === 1);
  t("…and the one next door too", (await providersFor(trade.id, otherLocal.id)) === 1);

  // ---------------- a locality choice does not leak upwards
  await saveCoverage(biz.id, { areaIds: [local.id], categoryIds: [trade.id], acceptsNearby: false });
  const exact = await db.businessServiceArea.findMany({ where: { businessId: biz.id } });
  t("choosing a locality saves as EXACT", exact.length === 1 && exact[0].mode === "EXACT");
  t("…covers that locality", (await providersFor(trade.id, local.id)) === 1);
  t("…and does NOT quietly cover the rest of the borough", (await providersFor(trade.id, otherLocal.id)) === 0);

  // ---------------- a change takes effect in matching immediately
  const j1 = await job(trade.id, otherLocal.id);
  const r1 = await matchJobRequest(j1.id);
  t("a job in an area they dropped does not reach them", r1.assigned.length === 0);

  await saveCoverage(biz.id, { areaIds: [local.id, otherLocal.id], categoryIds: [trade.id], acceptsNearby: false });
  const j2 = await job(trade.id, otherLocal.id);
  const r2 = await matchJobRequest(j2.id);
  t("…and the next job does, with no deploy and nothing to re-run", r2.assigned.length === 1 && r2.assigned[0].businessId === biz.id);

  // ---------------- trades
  const added = await saveCoverage(biz.id, { areaIds: [local.id], categoryIds: [trade.id, other.id], acceptsNearby: false });
  t("a second trade can be added", added.ok && (await currentCoverage(biz.id)).categoryIds.length === 2);
  t("…and the main trade is kept, because it decides the directory URL", (await currentCoverage(biz.id)).primaryCategoryId === trade.id);
  const j3 = await job(other.id, local.id);
  t("…and a job in the new trade reaches them", (await matchJobRequest(j3.id)).assigned.some((a) => a.businessId === biz.id));

  await saveCoverage(biz.id, { areaIds: [local.id], categoryIds: [other.id], acceptsNearby: false });
  t("dropping the old main trade promotes the remaining one rather than leaving none",
    (await currentCoverage(biz.id)).primaryCategoryId === other.id);
  const j4 = await job(trade.id, local.id);
  t("…and a job in the dropped trade no longer reaches them", !(await matchJobRequest(j4.id)).assigned.some((a) => a.businessId === biz.id));

  // ---------------- the nearby opt-in
  await saveCoverage(biz.id, { areaIds: [local.id], categoryIds: [trade.id], acceptsNearby: false });
  t("nearby work stays off through unrelated saves", (await currentCoverage(biz.id)).acceptsNearby === false);
  const on = await saveCoverage(biz.id, { areaIds: [local.id], categoryIds: [trade.id], acceptsNearby: true });
  t("it can be turned on", on.ok && on.nearbyChanged && (await currentCoverage(biz.id)).acceptsNearby === true);
  const again = await saveCoverage(biz.id, { areaIds: [local.id], categoryIds: [trade.id], acceptsNearby: true });
  t("…and saving it again is not reported as a change", again.ok && !again.nearbyChanged);
  await saveCoverage(biz.id, { areaIds: [local.id], categoryIds: [trade.id], acceptsNearby: false });
  t("…and it can be turned back off", (await currentCoverage(biz.id)).acceptsNearby === false);

  // ---------------- every change is on the record
  const trail = await db.auditLog.findMany({ where: { targetType: "Business", targetId: biz.id, action: { contains: "Service areas" } } });
  t("every coverage change is audited", trail.length >= 6, `${trail.length}`);
  t("…attributed to whoever made it", trail.every((r) => !!r.actorKind));
  t("…and the detail records what changed, not a copy of the record", trail.every((r) => /area\(s\)/.test(r.detail ?? "")));

  // ---------------- counts an owner can act on
  await saveCoverage(biz.id, { areaIds: [hackney.id], categoryIds: [trade.id, other.id], acceptsNearby: false });
  const demand = await demandInCoverage(biz.id);
  t("demand in their areas is counted from real requests", demand.requests >= 3, JSON.stringify(demand));
  t("…and counts what was actually sent to them separately", demand.assignedToYou >= 1, JSON.stringify(demand));
  const narrow = await saveCoverage(biz.id, { areaIds: [havering.id], categoryIds: [trade.id], acceptsNearby: false });
  t("…and narrowing to a borough with no requests shows zero rather than the old figure",
    narrow.ok && (await demandInCoverage(biz.id)).requests === 0);

  // ---------------- a wholesale replacement leaves nothing behind
  await saveCoverage(biz.id, { areaIds: [hackney.id, havering.id], categoryIds: [trade.id], acceptsNearby: false });
  await saveCoverage(biz.id, { areaIds: [local.id], categoryIds: [trade.id], acceptsNearby: false });
  t("replacing the set removes what is no longer chosen", (await db.businessServiceArea.count({ where: { businessId: biz.id } })) === 1);
  t("…and the same for trades", (await db.businessCategory.count({ where: { businessId: biz.id } })) === 1);
  t("…with exactly one marked as the main trade", (await db.businessCategory.count({ where: { businessId: biz.id, isPrimary: true } })) === 1);

  await cleanup();
  console.log(fail === 0 ? "\nALL COVERAGE TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
