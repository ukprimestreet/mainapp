import { db } from "../src/lib/db";
import { byInterest, byOwner, conversionStats, overdueFollowUps, pipelineByStage, timeToClose } from "../src/lib/sales";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const DAY = 86400_000;

// Whole-table aggregates here (pipelineByStage, conversionStats, timeToClose) are NOT scoped to this
// test's own fixtures, so assertions use before/after deltas or sanity bounds rather than exact global
// totals — see the lesson in scripts/test-membership.ts / /memories/repo/primestreet-notes.md.
(async () => {
  // ---------------------------------------------------------- DB fixtures
  const wipe = async () => {
    await db.salesEnquiry.deleteMany({ where: { email: { endsWith: "@salestest.invalid" } } });
    await db.adminUser.deleteMany({ where: { email: "sl-owner@salestest.invalid" } });
  };
  await wipe();

  const owner = await db.adminUser.create({ data: { email: "sl-owner@salestest.invalid", name: "Sl Owner Test", role: "ADMIN" } });

  const baselineStages = await pipelineByStage();
  const baselineBy = (status: string) => baselineStages.find((s) => s.status === status)?.count ?? 0;
  const baselineInterest = (await byInterest()).find((r) => r.interest === "sponsorship");
  const baseTotal = baselineInterest?.total ?? 0, baseWon = baselineInterest?.won ?? 0, baseLost = baselineInterest?.lost ?? 0;

  const now = new Date();
  // E1: won in 7 days, owned by the test admin
  const E1 = await db.salesEnquiry.create({ data: { name: "E1", email: "sl-1@salestest.invalid", interest: "sponsorship", message: "m", status: "WON", createdAt: new Date(now.getTime() - 10 * DAY), closedAt: new Date(now.getTime() - 3 * DAY), assignedToId: owner.id } });
  // E2: lost in 5 days, owned by the test admin
  const E2 = await db.salesEnquiry.create({ data: { name: "E2", email: "sl-2@salestest.invalid", interest: "sponsorship", message: "m", status: "LOST", createdAt: new Date(now.getTime() - 20 * DAY), closedAt: new Date(now.getTime() - 15 * DAY), assignedToId: owner.id } });
  // E3: open, overdue follow-up, owned by the test admin
  const E3 = await db.salesEnquiry.create({ data: { name: "E3", company: "SL Co", email: "sl-3@salestest.invalid", interest: "advertising", message: "m", status: "NEW", followUpAt: new Date(now.getTime() - 1 * DAY), assignedToId: owner.id } });
  // E4: open, unassigned, no follow-up
  const E4 = await db.salesEnquiry.create({ data: { name: "E4", email: "sl-4@salestest.invalid", interest: "advertising", message: "m", status: "CONTACTED" } });

  // ---------------------------------------------------------- pipeline by stage
  const stages = await pipelineByStage();
  const after = (status: string) => stages.find((s) => s.status === status)?.count ?? 0;
  t("pipelineByStage: NEW/CONTACTED/WON/LOST each increase by exactly the fixtures added", after("NEW") === baselineBy("NEW") + 1 && after("CONTACTED") === baselineBy("CONTACTED") + 1 && after("WON") === baselineBy("WON") + 1 && after("LOST") === baselineBy("LOST") + 1);

  // ---------------------------------------------------------- conversion
  const conv = await conversionStats();
  t("conversionStats: open/won/lost counts are sane and a win rate is computed among closed deals", conv.open >= 2 && conv.won >= 1 && conv.lost >= 1 && conv.winRatePct !== null && conv.winRatePct >= 0 && conv.winRatePct <= 100);

  // ---------------------------------------------------------- time to close
  const close = await timeToClose();
  t("timeToClose: positive averages for both won and lost (closedAt is a brand-new column, so this is close to exact for a fresh dev DB)", close.avgDaysWon !== null && close.avgDaysWon > 0 && close.avgDaysLost !== null && close.avgDaysLost > 0);

  // ---------------------------------------------------------- by interest
  const interests = await byInterest();
  const sponsorship = interests.find((r) => r.interest === "sponsorship")!;
  t("byInterest: sponsorship row's total/won/lost increase by exactly the fixtures added", sponsorship.total === baseTotal + 2 && sponsorship.won === baseWon + 1 && sponsorship.lost === baseLost + 1);

  // ---------------------------------------------------------- by owner
  const owners = await byOwner();
  const ownerRow = owners.find((o) => o.ownerId === owner.id)!;
  t("byOwner: a brand-new admin's row exactly matches the 3 deals assigned to them (1 open, 1 won, 1 lost, 1 overdue)", !!ownerRow && ownerRow.open === 1 && ownerRow.won === 1 && ownerRow.lost === 1 && ownerRow.overdueFollowUps === 1);

  // ---------------------------------------------------------- overdue follow-ups
  const overdue = await overdueFollowUps();
  const e3Row = overdue.find((o) => o.id === E3.id);
  t("overdueFollowUps: the overdue fixture appears with the right owner and company", !!e3Row && e3Row.ownerName === "Sl Owner Test" && e3Row.company === "SL Co");
  t("overdueFollowUps: a non-overdue / closed fixture never appears", !overdue.some((o) => o.id === E1.id || o.id === E2.id || o.id === E4.id));

  await wipe();
  console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
  process.exit(fail ? 1 : 0);
})();
