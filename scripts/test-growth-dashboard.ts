import { db } from "../src/lib/db";
import { CREDIT_PRODUCT_KEY } from "../src/lib/credits";
import {
  basicAlerts, deltaPct, leadsSubmitted, monthlyTargetPence, mrrNow, netMembershipGrowth,
  newPayingBusinesses, payingBusinessCount, recordedExpenses, resolveRange, revenueInRange, TARGET_SETTING_KEY,
} from "../src/lib/growth";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const DAY = 86400_000;

(async () => {
  // ---------------------------------------------------------- resolveRange (pure)
  const now = new Date("2026-10-26T15:00:00.000Z");
  const today = resolveRange({ range: "today" }, now);
  t("today: from start of day, not comparable", today.from.getTime() < now.getTime() && today.from.getHours() === 0 && !today.comparable);

  const d7 = resolveRange({ range: "7d" }, now);
  t("7d: 7-day window, comparable, prev window is the 7 days before", d7.comparable && Math.round((d7.to.getTime() - d7.from.getTime()) / DAY) === 7 && d7.prevTo.getTime() === d7.from.getTime() && Math.round((d7.prevTo.getTime() - d7.prevFrom.getTime()) / DAY) === 7);

  const thisMonth = resolveRange({ range: "this_month" }, now);
  t("this_month: starts on the 1st, not comparable (partial vs full month)", thisMonth.from.getDate() === 1 && !thisMonth.comparable);

  const lastMonth = resolveRange({ range: "last_month" }, now);
  t("last_month: full prior calendar month, comparable", lastMonth.comparable && lastMonth.from.getMonth() === 8 && lastMonth.to.getMonth() === 9 && lastMonth.to.getDate() === 1);

  const custom = resolveRange({ range: "custom", from: "2026-10-01", to: "2026-10-10" }, now);
  t("custom: inclusive of the end day, comparable, equal-length prior window", custom.comparable && Math.round((custom.to.getTime() - custom.from.getTime()) / DAY) === 10 && Math.round((custom.prevTo.getTime() - custom.prevFrom.getTime()) / DAY) === 10);

  const badCustom = resolveRange({ range: "custom" }, now); // no from/to supplied
  t("custom: falls back to 30d when from/to are missing", badCustom.key === "30d");

  t("deltaPct: null when not comparable or no prior data, rounds otherwise", deltaPct(150, 100, true) === 50 && deltaPct(100, 0, true) === null && deltaPct(100, 100, false) === null);

  // ---------------------------------------------------------- DB fixtures
  const wipe = async () => {
    await db.order.deleteMany({ where: { business: { slug: { startsWith: "gd-" } } } });
    await db.subscription.deleteMany({ where: { business: { slug: { startsWith: "gd-" } } } });
    await db.business.deleteMany({ where: { slug: { startsWith: "gd-" } } });
    await db.sponsorship.deleteMany({ where: { sponsorName: { startsWith: "GD " } } });
    await db.writerPayment.deleteMany({ where: { author: { email: "gd-writer@unit.test" } } });
    await db.author.deleteMany({ where: { email: "gd-writer@unit.test" } });
    await db.setting.deleteMany({ where: { key: TARGET_SETTING_KEY } });
  };
  await wipe();

  const city = (await db.city.findFirst())!, hk = (await db.location.findFirst({ where: { slug: "hackney" } }))!;
  const cat = (await db.category.findUnique({ where: { slug: "cleaning" } }))!;
  const mkb = (slug: string) => db.business.create({ data: { slug: `gd-${slug}`, name: `Gd ${slug}`, summary: "s".repeat(20), description: "d".repeat(80), cityId: city.id, locationId: hk.id, categoryId: cat.id, isSample: false } });
  const [A, B, C] = [await mkb("a"), await mkb("b"), await mkb("c")];

  const premium = await db.product.upsert({ where: { key: "unit_gd_premium" }, create: { key: "unit_gd_premium", kind: "PREMIUM", name: "GD premium", description: "d".repeat(20), pricePence: 2900, interval: "MONTH", active: true }, update: {} });
  const featured = await db.product.upsert({ where: { key: "unit_gd_featured" }, create: { key: "unit_gd_featured", kind: "FEATURED", name: "GD featured", description: "d".repeat(20), pricePence: 4900, interval: "ONE_OFF", durationDays: 14, active: true }, update: {} });

  const from = new Date(now.getTime() - 10 * DAY), to = now;

  // Revenue: one PAID premium order inside the window, one FAILED (excluded), one PAID featured order outside the window (excluded), one PAID lead-credit order inside the window
  await db.order.create({ data: { businessId: A.id, productKey: premium.key, amountPence: 2900, status: "PAID", paidAt: new Date(now.getTime() - 2 * DAY) } });
  await db.order.create({ data: { businessId: B.id, productKey: featured.key, amountPence: 4900, status: "FAILED" } });
  await db.order.create({ data: { businessId: C.id, productKey: featured.key, amountPence: 4900, status: "PAID", paidAt: new Date(now.getTime() - 20 * DAY) } });
  await db.order.create({ data: { businessId: C.id, productKey: CREDIT_PRODUCT_KEY, quantity: 10, amountPence: 1000, status: "PAID", paidAt: new Date(now.getTime() - 2 * DAY) } });
  await db.sponsorship.create({ data: { kind: "ARTICLE", sponsorName: "GD Sponsor", pricePence: 10000, invoiced: true, createdAt: new Date(now.getTime() - DAY) } });
  await db.sponsorship.create({ data: { kind: "ARTICLE", sponsorName: "GD Sponsor unpaid", pricePence: 5000, invoiced: false, createdAt: new Date(now.getTime() - DAY) } });

  const rev = await revenueInRange(from, to);
  // Lead credits are sold under their own product key, deliberately not a row in `Product` — this was
  // previously missed by `kindOf.get(...)` and silently folded into `featured`, which this assertion exists
  // to catch a regression of.
  t("revenue: sums PAID orders + invoiced sponsorships in range only; excludes FAILED, out-of-range and un-invoiced", rev.memberships === 2900 && rev.sponsorships === 10000 && rev.featured === 0 && rev.leadCredits === 1000 && rev.total === 13900, JSON.stringify(rev));
  t("revenue: lead credits are their own tracked stream, not folded into featured or left untracked", rev.untracked.every((u) => u.label !== "Lead credits"));
  t("revenue: remaining untracked streams are still disclosed, not silently zero", rev.untracked.some((u) => u.label === "Advertising") && rev.untracked.some((u) => u.label === "Partnerships"));

  // MRR: one active subscription on A, one cancelled on B (excluded), one past-due on C (included)
  await db.subscription.create({ data: { businessId: A.id, productKey: premium.key, status: "ACTIVE", provider: "STRIPE", createdAt: new Date(now.getTime() - 3 * DAY) } });
  await db.subscription.create({ data: { businessId: B.id, productKey: premium.key, status: "CANCELED", provider: "STRIPE", createdAt: new Date(now.getTime() - 50 * DAY), updatedAt: new Date(now.getTime() - 5 * DAY) } });
  await db.subscription.create({ data: { businessId: C.id, productKey: premium.key, status: "PAST_DUE", provider: "STRIPE", createdAt: new Date(now.getTime() - 60 * DAY) } });

  const mrr = await mrrNow();
  t("mrr: ACTIVE + PAST_DUE count, CANCELED excluded", mrr.pence === 2900 * 2 && mrr.activePlans === 2, JSON.stringify(mrr));

  const payingAsOf = await payingBusinessCount(to);
  t("paying businesses: distinct across subscriptions and paid orders (A has both, counted once; B has neither a paid order nor a live subscription)", payingAsOf === 2, String(payingAsOf));

  const newPaying = await newPayingBusinesses(from, to);
  t("new paying businesses: first-ever paid event inside the window only (C's first order was 20 days ago, outside)", newPaying === 1, String(newPaying));

  const growth = await netMembershipGrowth(from, to);
  t("net membership growth: started minus cancelled in range (only A's subscription started inside the window; B cancelled inside it, C started outside it)", growth.started === 1 && growth.cancelled === 1 && growth.net === 0, JSON.stringify(growth));

  // Leads
  await db.lead.create({ data: { businessId: A.id, name: "Unit", email: "unit@test.invalid", message: "m".repeat(25), createdAt: new Date(now.getTime() - DAY) } });
  await db.lead.create({ data: { businessId: A.id, name: "Unit2", email: "unit2@test.invalid", message: "m".repeat(25), createdAt: new Date(now.getTime() - 20 * DAY) } });
  const leads = await leadsSubmitted(from, to);
  t("leads submitted: counted within range only", leads === 1, String(leads));

  // Expenses (writer payments only)
  const writer = await db.author.create({ data: { email: "gd-writer@unit.test", name: "GD Writer", slug: "gd-writer-unit" } });
  await db.writerPayment.create({ data: { authorId: writer.id, amountPence: 3000, description: "Commission", status: "PAID", paidAt: new Date(now.getTime() - DAY) } });
  await db.writerPayment.create({ data: { authorId: writer.id, amountPence: 2000, description: "Due, not counted", status: "DUE" } });
  const exp = await recordedExpenses(from, to);
  t("expenses: APPROVED/PAID writer payments in range only; DUE excluded", exp.pence === 3000, JSON.stringify(exp));

  // Target
  t("monthly target: none set by default", (await monthlyTargetPence()) === null);
  await db.setting.create({ data: { key: TARGET_SETTING_KEY, value: "500000" } });
  t("monthly target: reads the Setting value as pence", (await monthlyTargetPence()) === 500000);
  await db.setting.update({ where: { key: TARGET_SETTING_KEY }, data: { value: "not-a-number" } });
  t("monthly target: junk value treated as not set, never a fabricated number", (await monthlyTargetPence()) === null);

  // Alerts
  await db.order.create({ data: { businessId: B.id, productKey: featured.key, amountPence: 4900, status: "FAILED", createdAt: new Date(now.getTime() - DAY) } });
  const alerts = await basicAlerts();
  t("alerts: surfaces the past-due subscription created above", alerts.some((a) => a.title.includes("past due")));

  await wipe();
  console.log(fail === 0 ? "\nAll growth-dashboard tests passed." : `\n${fail} growth-dashboard test(s) failed.`);
  process.exit(fail === 0 ? 0 : 1);
})();
