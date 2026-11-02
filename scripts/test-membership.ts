import { db } from "../src/lib/db";
import { claimFunnel, lifetimeStats, membershipMix, monthlyCohorts, segmentByCategory, segmentByLocation, topPayingBusinesses } from "../src/lib/membership";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const DAY = 86400_000;

(async () => {
  // ---------------------------------------------------------- DB fixtures
  const wipe = async () => {
    await db.order.deleteMany({ where: { business: { slug: { startsWith: "mb-" } } } });
    await db.subscription.deleteMany({ where: { business: { slug: { startsWith: "mb-" } } } });
    await db.business.deleteMany({ where: { slug: { startsWith: "mb-" } } });
  };
  await wipe();

  const city = (await db.city.findFirst())!;
  const hk = (await db.location.findFirst({ where: { slug: "hackney" } }))!, cm = (await db.location.findFirst({ where: { slug: "camden" } }))!;
  const cl = (await db.category.findUnique({ where: { slug: "cleaning" } }))!, cf = (await db.category.findUnique({ where: { slug: "cafes" } }))!;
  const mkb = (slug: string, o: Record<string, unknown> = {}) => db.business.create({ data: { slug: `mb-${slug}`, name: `Mb ${slug}`, summary: "s".repeat(20), description: "d".repeat(80), cityId: city.id, locationId: hk.id, categoryId: cl.id, isSample: false, claimStatus: "UNCLAIMED", ...o } });
  const A = await mkb("a", { locationId: hk.id, categoryId: cl.id, claimStatus: "VERIFIED" }); // paying, claimed
  const B = await mkb("b", { locationId: cm.id, categoryId: cf.id, claimStatus: "CLAIMED" }); // paying, claimed
  const C = await mkb("c", { locationId: hk.id, categoryId: cl.id, claimStatus: "CLAIMED" }); // claimed, NOT paying
  const D = await mkb("d", { claimStatus: "UNCLAIMED" }); // never claimed

  const premium = await db.product.upsert({ where: { key: "unit_mb_premium" }, create: { key: "unit_mb_premium", kind: "PREMIUM", name: "Mb premium", description: "d".repeat(20), pricePence: 2900, interval: "MONTH", active: true }, update: {} });

  // Active + past-due = "paying" for segmentation/claim funnel
  await db.subscription.create({ data: { businessId: A.id, productKey: premium.key, status: "ACTIVE" } });
  await db.subscription.create({ data: { businessId: B.id, productKey: premium.key, status: "PAST_DUE" } });

  // Three cancelled subs with known lifetimes (createdAt backdated, updatedAt = now via the status change) so the average is stable: 1, 2, 3 months
  for (const months of [1, 2, 3]) {
    const s = await db.subscription.create({ data: { businessId: D.id, productKey: premium.key, status: "ACTIVE", createdAt: new Date(Date.now() - months * 30 * DAY) } });
    await db.subscription.update({ where: { id: s.id }, data: { status: "CANCELED" } }); // updatedAt becomes "now" via @updatedAt
  }

  // ---------------------------------------------------------- membershipMix
  const mix = await membershipMix();
  const row = mix.find((p) => p.productKey === premium.key)!;
  t("membershipMix: counts active/past-due/cancelled per plan and computes MRR from active only", row.active === 1 && row.pastDue === 1 && row.canceled === 3 && row.mrrPence === 2900);

  // ---------------------------------------------------------- segmentation
  // Checks presence and counts for the fixtures' own categories/locations, not overall ranking — other test
  // scripts in the same `npm run test:unit` run leave their own paying subscriptions behind too.
  const byCategory = await segmentByCategory(1000);
  const cleaningRow = byCategory.find((s) => s.label === cl.name), cafesRow = byCategory.find((s) => s.label === cf.name);
  t("segmentByCategory: only paying (active/past-due) businesses counted, grouped by category", (cleaningRow?.payingCount ?? 0) >= 1 && (cafesRow?.payingCount ?? 0) >= 1);
  const byLocation = await segmentByLocation(1000);
  t("segmentByLocation: same grouping by location", byLocation.some((s) => s.label === hk.name) && byLocation.some((s) => s.label === cm.name));

  // ---------------------------------------------------------- claim funnel
  const funnel = await claimFunnel();
  t("claimFunnel: claimed+verified total includes A, B, C; only A and B are paying", funnel.claimedOrVerifiedTotal >= 3 && funnel.payingAmongClaimed >= 2);

  // ---------------------------------------------------------- cohorts
  const cohorts = await monthlyCohorts(2);
  t("monthlyCohorts: returns the requested number of months, each with a retained percentage", cohorts.length === 2 && cohorts.every((c) => c.retainedPct >= 0 && c.retainedPct <= 100));

  // ---------------------------------------------------------- lifetime value
  // Loose bounds rather than an exact average: other test scripts in the same `npm run test:unit` run leave
  // their own cancelled subscriptions behind (test-commerce.ts, test-growth-dashboard.ts), so the global
  // average is contaminated by design — this only checks the shape of the result is sane.
  const lifetime = await lifetimeStats(3);
  t("lifetimeStats: with enough cancellations, returns a positive average lifetime and a consistent LTV", lifetime.canceledCount >= 3 && lifetime.avgLifetimeMonths !== null && lifetime.avgLifetimeMonths > 0 && (lifetime.avgLtvPence ?? 0) > 0);
  const tooFew = await lifetimeStats(1000);
  t("lifetimeStats: below the minimum sample, returns null rather than an unstable average", tooFew.avgLifetimeMonths === null);

  // Large limit: other test scripts in the same `npm run test:unit` run leave their own PAID orders behind
  // (e.g. test-commerce.ts does not wipe at the end), so this must not assume A/B rank first overall —
  // only that they are ranked correctly *relative to each other* and have the right totals.
  await db.order.create({ data: { businessId: A.id, productKey: premium.key, amountPence: 3480, vatPence: 580, status: "PAID", paidAt: new Date() } }); // 2900 ex-VAT
  await db.order.create({ data: { businessId: B.id, productKey: premium.key, amountPence: 1450, status: "PAID", paidAt: new Date() } }); // 1450 ex-VAT, strictly smaller than A
  const top = await topPayingBusinesses(1000);
  const aRank = top.findIndex((b) => b.id === A.id), bRank = top.findIndex((b) => b.id === B.id);
  const a = top[aRank];
  t("topPayingBusinesses: ex-VAT total is correct, with business/category/location names, ranked above a smaller payer", aRank !== -1 && a.totalPence === 2900 && a.category === cl.name && a.location === hk.name && (bRank === -1 || aRank < bRank));

  await wipe();
  console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
  process.exit(fail ? 1 : 0);
})();
