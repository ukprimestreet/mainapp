import { db } from "../src/lib/db";
import { processEvent } from "../src/lib/billing";
import { applyVat, formatRate, vatSettings, VAT_ENABLED_KEY, VAT_RATE_KEY } from "../src/lib/vat";
import { revenueInRange, recordedExpenses } from "../src/lib/growth";
import { expensesByCategory, failedPayments, outstandingInvoices, ordersCsv, refundedOrders } from "../src/lib/finance";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const DAY = 86400_000;

(async () => {
  // ---------------------------------------------------------- vat.ts (pure)
  t("applyVat: off by default → unchanged, no VAT", JSON.stringify(applyVat(2900, { enabled: false, rateBp: 2000 })) === JSON.stringify({ grossPence: 2900, vatPence: 0, rateBp: 0 }));
  t("applyVat: on at 20% → gross = net + vat, rounds to the penny", JSON.stringify(applyVat(2900, { enabled: true, rateBp: 2000 })) === JSON.stringify({ grossPence: 3480, vatPence: 580, rateBp: 2000 }));
  t("applyVat: zero/negative net is a no-op even when enabled", applyVat(0, { enabled: true, rateBp: 2000 }).vatPence === 0);
  t("formatRate: whole percents have no decimals, fractional ones do", formatRate(2000) === "20%" && formatRate(1750) === "17.50%");

  // ---------------------------------------------------------- vatSettings (DB-backed)
  const wipeSettings = () => db.setting.deleteMany({ where: { key: { in: [VAT_ENABLED_KEY, VAT_RATE_KEY] } } });
  await wipeSettings();
  t("vatSettings: off and a sane default rate when nothing is configured", (await vatSettings()).enabled === false && (await vatSettings()).rateBp === 2000);
  await db.setting.upsert({ where: { key: VAT_ENABLED_KEY }, create: { key: VAT_ENABLED_KEY, value: "yes" }, update: { value: "yes" } });
  await db.setting.upsert({ where: { key: VAT_RATE_KEY }, create: { key: VAT_RATE_KEY, value: "2000" }, update: { value: "2000" } });
  t("vatSettings: reads the admin-configured toggle and rate", (await vatSettings()).enabled === true && (await vatSettings()).rateBp === 2000);
  await db.setting.update({ where: { key: VAT_RATE_KEY }, data: { value: "not-a-number" } });
  t("vatSettings: an invalid rate falls back to the default rather than NaN/0", (await vatSettings()).rateBp === 2000);
  await wipeSettings();

  // ---------------------------------------------------------- DB fixtures
  const wipe = async () => {
    await db.order.deleteMany({ where: { business: { slug: { startsWith: "fin-" } } } });
    await db.subscription.deleteMany({ where: { business: { slug: { startsWith: "fin-" } } } });
    await db.business.deleteMany({ where: { slug: { startsWith: "fin-" } } });
    await db.sponsorship.deleteMany({ where: { sponsorName: { startsWith: "Fin " } } });
    await db.expense.deleteMany({ where: { description: { startsWith: "Unit test" } } });
    await db.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_fin" } } });
  };
  await wipe();
  const city = (await db.city.findFirst())!, hk = (await db.location.findFirst({ where: { slug: "hackney" } }))!;
  const cat = (await db.category.findUnique({ where: { slug: "cleaning" } }))!;
  const mkb = (slug: string) => db.business.create({ data: { slug: `fin-${slug}`, name: `Fin ${slug}`, summary: "s".repeat(20), description: "d".repeat(80), cityId: city.id, locationId: hk.id, categoryId: cat.id, isSample: false } });
  const [A, B] = [await mkb("a"), await mkb("b")];
  const product = await db.product.upsert({ where: { key: "unit_fin_premium" }, create: { key: "unit_fin_premium", kind: "PREMIUM", name: "Fin premium", description: "d".repeat(20), pricePence: 2900, interval: "MONTH", active: true }, update: {} });

  // ---------------------------------------------------------- invoice.paid renewal recording
  const sub = await db.subscription.create({ data: { businessId: A.id, productKey: product.key, status: "ACTIVE", provider: "STRIPE", stripeSubscriptionId: "sub_fin_1", currentPeriodEnd: new Date(Date.now() + 30 * DAY) } });
  const invoiceEvent = (id: string, billingReason: string) => ({ id, type: "invoice.paid", data: { object: { id: `in_${id}`, subscription: "sub_fin_1", billing_reason: billingReason, lines: { data: [{ period: { end: Math.floor((Date.now() + 30 * DAY) / 1000) } }] } } } });

  const r1 = await processEvent(invoiceEvent("evt_fin_1", "subscription_create"));
  t("invoice.paid: the subscription's first invoice extends the period but does not duplicate the initial order", r1 === "period extended");
  const ordersAfterFirst = await db.order.count({ where: { businessId: A.id } });
  t("invoice.paid: no order created for the first invoice", ordersAfterFirst === 0);

  const r2 = await processEvent(invoiceEvent("evt_fin_2", "subscription_cycle"));
  t("invoice.paid: a renewal invoice records a new RENEWAL order", r2 === "renewal recorded");
  const renewal = await db.order.findFirst({ where: { businessId: A.id, source: "RENEWAL" } });
  t("invoice.paid: renewal order is PAID, for the product's price, with no VAT (VAT is off)", !!renewal && renewal.status === "PAID" && renewal.amountPence === 2900 && renewal.vatPence === 0);

  const r3 = await processEvent(invoiceEvent("evt_fin_3", "subscription_cycle")); // a distinct invoice/event — a second, later renewal
  t("invoice.paid: a second distinct renewal is recorded (not deduped by subscription alone)", r3 === "renewal recorded" && (await db.order.count({ where: { businessId: A.id, source: "RENEWAL" } })) === 2);

  const dup = await processEvent(invoiceEvent("evt_fin_2", "subscription_cycle")); // identical Stripe event id replayed
  t("invoice.paid: the same Stripe event id replayed is a no-op (outer idempotency guard)", dup === "duplicate" && (await db.order.count({ where: { businessId: A.id, source: "RENEWAL" } })) === 2);

  // ---------------------------------------------------------- revenue excludes VAT
  await db.order.create({ data: { businessId: B.id, productKey: product.key, amountPence: 3480, vatPence: 580, vatRateBp: 2000, source: "CHECKOUT", status: "PAID", paidAt: new Date() } });
  const rev = await revenueInRange(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
  t("revenueInRange: VAT is reported separately, never folded into revenue", rev.memberships >= 2900 && rev.vatCollected >= 580);

  // ---------------------------------------------------------- finance.ts
  await db.order.create({ data: { businessId: B.id, productKey: product.key, amountPence: 2900, status: "FAILED", createdAt: new Date() } });
  const failed = await failedPayments(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
  t("failedPayments: includes the failed order with its business name", failed.some((f) => f.businessName === B.name && f.status === "FAILED"));

  const toRefund = await db.order.create({ data: { businessId: B.id, productKey: product.key, amountPence: 2900, status: "REFUNDED", paidAt: new Date(), createdAt: new Date() } });
  const refunds = await refundedOrders(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
  t("refundedOrders: includes admin-confirmed refunds only (status REFUNDED)", refunds.some((r) => r.id === toRefund.id));

  await db.sponsorship.create({ data: { kind: "ARTICLE", sponsorName: "Fin Sponsor", pricePence: 5000, status: "ACTIVE", invoiced: false } });
  const outstanding = await outstandingInvoices();
  t("outstandingInvoices: agreed but not-yet-invoiced sponsorships surface here", outstanding.some((o) => o.sponsorName === "Fin Sponsor"));

  await db.expense.create({ data: { category: "HOSTING", description: "Unit test hosting bill", amountPence: 1200, date: new Date() } });
  await db.expense.create({ data: { category: "HOSTING", description: "Unit test hosting bill 2", amountPence: 300, date: new Date() } });
  await db.expense.create({ data: { category: "MARKETING", description: "Unit test ads", amountPence: 500, date: new Date() } });
  const byCat = await expensesByCategory(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
  t("expensesByCategory: grouped and summed, largest first", byCat[0].category === "HOSTING" && byCat[0].pence === 1500 && byCat.some((c) => c.category === "MARKETING" && c.pence === 500));

  const recorded = await recordedExpenses(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
  t("recordedExpenses: folds the new Expense ledger in alongside writer payments", recorded.pence >= 2000);

  const csv = await ordersCsv(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
  t("ordersCsv: header + at least one row, ex-VAT/VAT/gross all present", csv.startsWith('"Date"') && csv.includes("Fin b") && csv.split("\r\n").length >= 3);

  await db.expense.deleteMany({ where: { description: { startsWith: "Unit test" } } });
  await db.sponsorship.deleteMany({ where: { sponsorName: "Fin Sponsor" } });
  await wipe();

  console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
  process.exit(fail ? 1 : 0);
})();
