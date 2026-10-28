/**
 * Buying lead credits, and being warned before they run out.
 *
 * This is the money path, and the two failures it exists to prevent are opposites:
 *
 *   1. A business pays and does not get its credits — or pays once and gets them twice because Stripe
 *      replayed a webhook. Both are tested by driving `processEvent` directly.
 *   2. A business runs out and is never told. The matcher excludes a zero balance with a recorded reason,
 *      which is correct and completely invisible to them, so the warning is the only thing standing between
 *      "no leads" and "no leads and no idea why".
 *
 * No Stripe calls are made: `createCreditCheckout` is tested for its refusals, and the grant is tested
 * through the webhook handler, which is where the credits actually appear.
 */
import { PrismaClient } from "@prisma/client";
import { createCreditCheckout, processEvent } from "../src/lib/billing";
import {
  CREDIT_PRICE_PENCE, CREDIT_PRODUCT_KEY, LOW_BALANCE_THRESHOLD, MAX_CREDITS_PER_PURCHASE,
  MIN_CREDITS_PER_PURCHASE, creditAccount, creditBalance, reconcile, spendCredits,
} from "../src/lib/credits";
import { warnLowBalance } from "../src/lib/lead-notify";
import { mailConfigured } from "../src/lib/mail";
import { VAT_ENABLED_KEY, VAT_RATE_KEY, applyVat, vatSettings } from "../src/lib/vat";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const SLUG = "credit-suite-";
const OWNER = "owner@credit-suite.example";
let evt = 0;

async function cleanup() {
  const biz = await db.business.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = biz.map((b) => b.id);
  if (ids.length) {
    await db.leadAssignment.deleteMany({ where: { businessId: { in: ids } } });
    await db.creditTransaction.deleteMany({ where: { businessId: { in: ids } } });
    await db.creditAccount.deleteMany({ where: { businessId: { in: ids } } });
    await db.order.deleteMany({ where: { businessId: { in: ids } } });
    await db.businessServiceArea.deleteMany({ where: { businessId: { in: ids } } });
    await db.businessCategory.deleteMany({ where: { businessId: { in: ids } } });
    await db.businessOwner.deleteMany({ where: { businessId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { targetType: "Business", targetId: { in: ids } } });
    await db.business.deleteMany({ where: { id: { in: ids } } });
  }
  await db.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_credit_suite_" } } });
  await db.emailOutbox.deleteMany({ where: { to: { contains: "credit-suite" } } });
  const o = await db.owner.findUnique({ where: { email: OWNER }, select: { id: true } });
  if (o) { await db.ownerLoginToken.deleteMany({ where: { ownerId: o.id } }); await db.owner.delete({ where: { id: o.id } }); }
  // Leave VAT exactly as it was found.
  await db.setting.deleteMany({ where: { key: { in: [VAT_ENABLED_KEY, VAT_RATE_KEY] }, value: { in: ["yes-credit-suite"] } } });
}

/** The webhook event Stripe sends when a checkout is paid. */
const paidEvent = (orderId: string, sessionId: string) => ({
  id: `evt_credit_suite_${++evt}`,
  type: "checkout.session.completed",
  data: { object: { id: sessionId, payment_status: "paid", client_reference_id: orderId, metadata: { order_id: orderId } } },
});

async function main() {
  // Never send: this suite creates orders and would otherwise email a made-up owner.
  delete process.env.RESEND_API_KEY;
  if (mailConfigured()) throw new Error("mail is still configured to send; refusing to run");
  await cleanup();

  const borough = (await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } }))!;
  const trade = (await db.category.findFirst({ where: { slug: "plumbing" } }))!;
  const any = (await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } }))!;
  const owner = await db.owner.create({ data: { email: OWNER, name: "Cora Credit" } });

  async function trader(n: number, opts: { matchable?: boolean } = {}) {
    const b = await db.business.create({
      data: {
        name: `Credit Suite Trader ${n}`, slug: `${SLUG}${n}`,
        summary: "A fixture, created and removed by scripts/test-credit-purchase.ts.",
        description: "A fixture, created and removed by scripts/test-credit-purchase.ts.",
        categoryId: trade.id, locationId: any.locationId, cityId: any.cityId, published: true, isSample: false,
      },
    });
    await db.businessOwner.create({ data: { ownerId: owner.id, businessId: b.id } });
    await creditAccount(b.id);
    if (opts.matchable !== false) {
      await db.businessCategory.create({ data: { businessId: b.id, categoryId: trade.id, isPrimary: true } });
      await db.businessServiceArea.create({ data: { businessId: b.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });
    }
    return b;
  }

  const a = await trader(1);

  // ---------------- the price is one number, in one place
  t("a credit is £1", CREDIT_PRICE_PENCE === 100);
  t("credits are sold under their own product key, not a Product row", CREDIT_PRODUCT_KEY === "lead-credits" &&
    (await db.product.count({ where: { key: CREDIT_PRODUCT_KEY } })) === 0);

  // ---------------- refusals, before any money or any Stripe call
  process.env.STRIPE_SECRET_KEY = "sk_test_credit_suite";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_credit_suite";
  const urls = { successUrl: "https://example.test/ok", cancelUrl: "https://example.test/no" };
  const base = { businessId: a.id, ownerId: owner.id, ownerEmail: OWNER, ...urls };

  const tooFew = await createCreditCheckout({ ...base, quantity: MIN_CREDITS_PER_PURCHASE - 1 });
  t("buying fewer than the minimum is refused", "error" in tooFew && /between/i.test(tooFew.error));
  const tooMany = await createCreditCheckout({ ...base, quantity: MAX_CREDITS_PER_PURCHASE + 1 });
  t("buying more than the maximum is refused", "error" in tooMany);
  const negative = await createCreditCheckout({ ...base, quantity: -10 });
  t("a negative quantity is refused", "error" in negative);
  const fractional = await createCreditCheckout({ ...base, quantity: 7.9 });
  t("a fractional quantity is refused rather than quietly rounded down", "error" in fractional,
    "7.9 silently sold 7 credits before this check existed");
  const nonsense = await createCreditCheckout({ ...base, quantity: Number.NaN });
  t("a non-number is refused", "error" in nonsense);
  t("…and none of those created an order", (await db.order.count({ where: { businessId: a.id } })) === 0);

  delete process.env.STRIPE_SECRET_KEY;
  const unconfigured = await createCreditCheckout({ ...base, quantity: 10 });
  t("with no Stripe keys, buying is refused with an honest message",
    "error" in unconfigured && /isn't set up/i.test(unconfigured.error) && /by hand/i.test(unconfigured.error),
    "error" in unconfigured ? unconfigured.error : "no error returned");
  t("…and still no order exists", (await db.order.count({ where: { businessId: a.id } })) === 0);
  process.env.STRIPE_SECRET_KEY = "sk_test_credit_suite";

  // ---------------- the grant, through the webhook
  const order = await db.order.create({
    data: { businessId: a.id, ownerId: owner.id, productKey: CREDIT_PRODUCT_KEY, quantity: 12, amountPence: 1200, source: "CHECKOUT", stripeSessionId: "cs_credit_suite_1" },
  });
  const before = await creditBalance(a.id);
  const result = await processEvent(paidEvent(order.id, "cs_credit_suite_1"));
  t("a paid checkout grants the credits", result === "12 credits granted", result);
  t("…the balance moves by exactly the quantity bought", (await creditBalance(a.id)) === before + 12);
  t("…the order is marked paid", (await db.order.findUnique({ where: { id: order.id } }))?.status === "PAID");
  t("…with a PURCHASE ledger row pointing at the order",
    !!(await db.creditTransaction.findFirst({ where: { businessId: a.id, kind: "PURCHASE", orderId: order.id } })));
  t("…and the ledger agrees with the balance", (await reconcile(a.id)).agrees);
  t("the purchase is audited", !!(await db.auditLog.findFirst({ where: { targetType: "Business", targetId: a.id, action: { contains: "purchased" } } })));

  // ---------------- a replayed webhook
  const replay = await processEvent(paidEvent(order.id, "cs_credit_suite_1"));
  t("a DIFFERENT event for the same order does not grant twice", replay !== "12 credits granted", replay);
  t("…the balance is unchanged", (await creditBalance(a.id)) === before + 12);
  t("…and there is exactly one PURCHASE row for that order",
    (await db.creditTransaction.count({ where: { orderId: order.id, kind: "PURCHASE" } })) === 1);

  const sameEvent = { ...paidEvent(order.id, "cs_credit_suite_1"), id: "evt_credit_suite_1" };
  t("the same event id is recognised as a duplicate", (await processEvent(sameEvent)) === "duplicate");
  t("…and still nothing was granted twice", (await creditBalance(a.id)) === before + 12);

  // ---------------- an unpaid session grants nothing
  const pending = await db.order.create({
    data: { businessId: a.id, productKey: CREDIT_PRODUCT_KEY, quantity: 50, amountPence: 5000, stripeSessionId: "cs_credit_suite_2" },
  });
  const unpaid = await processEvent({
    id: `evt_credit_suite_${++evt}`, type: "checkout.session.completed",
    data: { object: { id: "cs_credit_suite_2", payment_status: "unpaid", client_reference_id: pending.id, metadata: { order_id: pending.id } } },
  });
  t("an unpaid session grants nothing", unpaid === "not paid yet" && (await creditBalance(a.id)) === before + 12);
  t("…and the order stays pending", (await db.order.findUnique({ where: { id: pending.id } }))?.status === "PENDING");

  // ---------------- VAT: off by default, added on top when switched on
  const off = await vatSettings();
  t("VAT is off until somebody switches it on", off.enabled === false, JSON.stringify(off));
  const netOnly = applyVat(10 * CREDIT_PRICE_PENCE, off);
  t("…so ten credits cost exactly £10", netOnly.grossPence === 1000 && netOnly.vatPence === 0);

  const withVat = applyVat(10 * CREDIT_PRICE_PENCE, { enabled: true, rateBp: 2000 });
  t("with VAT at 20%, ten credits cost £12", withVat.grossPence === 1200 && withVat.vatPence === 200);
  t("…and the £1 base price is unchanged, as D4 requires", withVat.grossPence - withVat.vatPence === 1000);

  // ---------------- the warnings
  const b = await trader(2);
  const noAreas = await trader(3, { matchable: false });
  await db.creditAccount.update({ where: { businessId: b.id }, data: { balance: LOW_BALANCE_THRESHOLD } });
  await db.creditAccount.update({ where: { businessId: noAreas.id }, data: { balance: 0 } });

  const firstRun = await warnLowBalance();
  t("a business that is nearly out is warned", firstRun.low >= 1, JSON.stringify(firstRun));
  const warning = await db.emailOutbox.findFirst({ where: { to: OWNER, subject: { contains: "lead credit" } }, orderBy: { createdAt: "desc" } });
  t("…with the number left in the subject, so it is readable without opening", /2 lead credits left/.test(warning?.subject ?? ""), warning?.subject);
  t("…saying what happens at zero", /go to other businesses/i.test(warning?.body ?? ""));
  t("…and that the listing is unaffected, because that is the fear", /listing is unaffected/i.test(warning?.body ?? ""));
  t("…linking to the page that sells them", (warning?.body ?? "").includes(`/owner/business/${b.id}/credits`));
  t("…from the billing sender, not the lead sender", warning?.purpose === "billing");
  t("a business with no service areas is NOT warned: credits are not what is stopping it",
    !(await db.emailOutbox.findFirst({ where: { to: OWNER, subject: { contains: noAreas.name } } })));

  t("warning twice sends nothing", (await warnLowBalance()).sent === 0);
  t("…and the warning is recorded on the account", !!(await db.creditAccount.findUnique({ where: { businessId: b.id } }))?.lowWarnedAt);

  // ---------------- zero is a different, stronger message
  const spent = await spendCredits(b.id, LOW_BALANCE_THRESHOLD, "Coverage suite: spend to zero");
  t("spending down to zero works", spent.ok && (await creditBalance(b.id)) === 0);
  const zeroRun = await warnLowBalance();
  t("hitting zero sends a second, different warning", zeroRun.empty >= 1, JSON.stringify(zeroRun));
  const zeroMail = await db.emailOutbox.findFirst({ where: { to: OWNER, subject: { contains: "not receiving job requests" } } });
  t("…whose subject says they are not receiving job requests", !!zeroMail);
  t("…and which states plainly that the listing is still live", /listing is live/i.test(zeroMail?.body ?? ""));
  t("…and respects somebody who wants to stay at zero", /leave it at zero/i.test(zeroMail?.body ?? ""));
  t("the zero warning is recorded separately from the low one",
    !!(await db.creditAccount.findUnique({ where: { businessId: b.id } }))?.zeroWarnedAt);
  t("both warnings together send nothing more", (await warnLowBalance()).sent === 0);

  // ---------------- topping up re-arms the warnings
  const topUp = await db.order.create({
    data: { businessId: b.id, productKey: CREDIT_PRODUCT_KEY, quantity: 25, amountPence: 2500, stripeSessionId: "cs_credit_suite_3" },
  });
  await processEvent(paidEvent(topUp.id, "cs_credit_suite_3"));
  const account = await db.creditAccount.findUnique({ where: { businessId: b.id } });
  t("buying credits clears both warning flags", account?.lowWarnedAt === null && account?.zeroWarnedAt === null,
    "otherwise a business is warned once ever, and hears nothing the second time it runs down");
  t("…and the balance is right", (await creditBalance(b.id)) === 25);

  await db.creditAccount.update({ where: { businessId: b.id }, data: { balance: 1 } });
  t("so running low again warns again", (await warnLowBalance()).low >= 1);

  await cleanup();
  console.log(fail === 0 ? "\nALL CREDIT PURCHASE TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
