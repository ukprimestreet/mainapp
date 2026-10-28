/**
 * End-to-end: a business buys lead credits and starts receiving work again.
 *
 * The Next server must run with the test Stripe settings, and with mail off:
 *
 *   MAIL_DOMAIN= MAIL_FROM= STRIPE_SECRET_KEY=sk_test_e2e STRIPE_WEBHOOK_SECRET=whsec_e2e_credits \
 *     STRIPE_API_BASE=http://127.0.0.1:3997 npx next start -p 3418
 *   node scripts/e2e-credits.mjs
 *
 * This script runs the mock Stripe API on :3997 and signs its own webhook, so no money and no real request
 * ever leaves the machine.
 *
 * Why this is worth a browser test rather than only a unit one: the thing that was broken was not the
 * arithmetic, it was that **no page existed**. `creditPurchase()` had been sitting in the library, correct
 * and unreachable, while `/register` promised businesses they could buy credits at £1 each. So the assertion
 * that matters is that somebody can press a button and end up with more credits.
 */
import http from "http";
import puppeteer from "puppeteer-core";
import { createHmac, randomBytes, createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3418";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const WEBHOOK_SECRET = "whsec_e2e_credits";

const db = new PrismaClient();
let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const sha = (x) => createHash("sha256").update(x).digest("hex");

const MARK = "e2ecredits";
const SLUG = "e2e-credits-";
const OWNER = `owner@${MARK}.example`;

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
  await db.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_e2e_credits_" } } });
  await db.emailOutbox.deleteMany({ where: { to: { contains: MARK } } });
  const o = await db.owner.findUnique({ where: { email: OWNER }, select: { id: true } });
  if (o) { await db.ownerLoginToken.deleteMany({ where: { ownerId: o.id } }); await db.owner.delete({ where: { id: o.id } }); }
}

// ---------------------------------------------------------------- the mock Stripe
const stripeCalls = [];
let sessionN = 0;
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const params = Object.fromEntries(new URLSearchParams(body));
    stripeCalls.push({ path: req.url, auth: req.headers.authorization, params });
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url === "/checkout/sessions") {
      const id = `cs_e2e_credits_${++sessionN}`;
      return res.end(JSON.stringify({ id, url: `https://checkout.stripe.test/pay/${id}` }));
    }
    res.end(JSON.stringify({}));
  });
});
await new Promise((r) => mock.listen(3997, "127.0.0.1", r));

/** Posts a signed event at our own webhook, exactly as Stripe would. */
async function webhook(event) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = `t=${ts},v1=${createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${raw}`).digest("hex")}`;
  const r = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body: raw,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const text = (page) => page.evaluate(() => document.body.innerText);

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });

try {
  await cleanup();

  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } });
  const trade = await db.category.findFirst({ where: { slug: "plumbing" } });
  const any = await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } });
  const owner = await db.owner.create({ data: { email: OWNER, name: "Casey Credits" } });

  const business = await db.business.create({
    data: {
      name: "E2E Credits Trader", slug: `${SLUG}1`,
      summary: "A fixture, created and removed by scripts/e2e-credits.mjs.",
      description: "A fixture, created and removed by scripts/e2e-credits.mjs.",
      categoryId: trade.id, locationId: any.locationId, cityId: any.cityId, published: true, isSample: false,
    },
  });
  await db.businessCategory.create({ data: { businessId: business.id, categoryId: trade.id, isPrimary: true } });
  await db.businessServiceArea.create({ data: { businessId: business.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });
  await db.businessOwner.create({ data: { ownerId: owner.id, businessId: business.id } });
  // Out of credits, which is the state this whole batch is about.
  await db.creditAccount.create({ data: { businessId: business.id, balance: 0 } });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });

  // ---- sign in
  const raw = randomBytes(18).toString("base64url");
  await db.ownerLoginToken.create({ data: { ownerId: owner.id, tokenHash: sha(raw), expiresAt: new Date(Date.now() + 600000) } });
  // `networkidle0`, not `domcontentloaded`: the button is a server action, and clicking it before React has
  // hydrated does nothing at all — which looks exactly like a broken sign-in.
  await page.goto(`${BASE}/owner/login/${raw}`, { waitUntil: "networkidle0" });
  const signInButtons = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim()));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Sign in")?.click());
  await page.waitForFunction(() => location.pathname === "/owner", { timeout: 20000 }).catch(async () => {
    throw new Error(`sign-in did not land: at ${page.url()} · buttons=${JSON.stringify(signInButtons)} · ${(await text(page)).slice(0, 300)}`);
  });

  // Stripe's hosted page does not exist, so the redirect to it is caught rather than followed. Switched on
  // AFTER signing in: intercepting the sign-in POST stopped it landing on the dashboard at all.
  const redirects = [];
  await page.setRequestInterception(true);
  page.on("request", (rq) => {
    if (/checkout\.stripe\.test/.test(rq.url())) { redirects.push(rq.url()); rq.abort().catch(() => {}); }
    else rq.continue().catch(() => {});
  });

  // ================================================================ the page exists and is honest
  await page.goto(`${BASE}/owner/business/${business.id}/credits`, { waitUntil: "domcontentloaded" });
  const shown = await text(page);
  t("the credits page opens", /lead credits/i.test(shown));
  t("…and says, at zero, that they are not receiving job requests", /not receiving job requests/i.test(shown), shown.slice(0, 300));
  t("…that the listing is unaffected, because that is the actual fear", /listing is unaffected/i.test(shown));
  // The site's own formatter drops ".00", so this is "£1" rather than "£1.00".
  t("…the price per credit", /£1/.test(shown) && /per credit/i.test(shown), shown.slice(0, 300));
  t("…that no VAT applies while PrimeStreet is not registered", /not VAT-registered/i.test(shown), "D4: VAT must not be charged before registration");
  t("…and what a credit buys", /maximum of 2 businesses/i.test(shown));

  // ================================================================ buying
  await page.click('button::-p-text(25 credits)');
  await page.waitForFunction(() => true, { timeout: 2000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));

  const call = stripeCalls.find((c) => c.path === "/checkout/sessions");
  t("pressing a pack starts a checkout with our payment provider", !!call, JSON.stringify(stripeCalls));
  t("…priced per credit, with a real quantity on the line item",
    call?.params["line_items[0][quantity]"] === "25" && call?.params["line_items[0][price_data][unit_amount]"] === "100",
    JSON.stringify(call?.params));
  t("…in pounds", call?.params["line_items[0][price_data][currency]"] === "gbp");
  t("…as a one-off payment, not a subscription", call?.params.mode === "payment");
  t("…carrying the credits bought in the metadata", call?.params["metadata[credits]"] === "25");
  t("the browser is sent to the provider's hosted page", redirects.some((u) => /checkout\.stripe\.test\/pay\/cs_e2e_credits_/.test(u)), JSON.stringify(redirects));

  const order = await db.order.findFirst({ where: { businessId: business.id }, orderBy: { createdAt: "desc" } });
  t("an order is recorded before the customer leaves the site", !!order && order.status === "PENDING");
  t("…with the quantity, so the grant does not have to divide to find it", order?.quantity === 25);
  t("…priced from OUR figures, not the browser's", order?.amountPence === 2500);
  t("…no VAT while it is switched off", order?.vatPence === 0 && order?.vatRateBp === 0);
  t("…and NOTHING has been credited yet, because nothing has been paid", (await db.creditAccount.findUnique({ where: { businessId: business.id } })).balance === 0);

  // ================================================================ the payment confirmation
  const paid = await webhook({
    id: "evt_e2e_credits_1", type: "checkout.session.completed",
    data: { object: { id: order.stripeSessionId, payment_status: "paid", client_reference_id: order.id, metadata: { order_id: order.id } } },
  });
  t("the webhook is accepted", paid.status === 200, JSON.stringify(paid));
  t("…and reports what it did", /25 credits granted/.test(JSON.stringify(paid.body)), JSON.stringify(paid.body));

  const after = await db.creditAccount.findUnique({ where: { businessId: business.id } });
  t("the credits arrive", after.balance === 25);
  t("…the order is marked paid", (await db.order.findUnique({ where: { id: order.id } })).status === "PAID");
  t("…with a PURCHASE row in the ledger", !!(await db.creditTransaction.findFirst({ where: { orderId: order.id, kind: "PURCHASE" } })));

  const replay = await webhook({
    id: "evt_e2e_credits_2", type: "checkout.session.completed",
    data: { object: { id: order.stripeSessionId, payment_status: "paid", client_reference_id: order.id, metadata: { order_id: order.id } } },
  });
  t("a replayed confirmation does not grant twice", replay.status === 200 &&
    (await db.creditAccount.findUnique({ where: { businessId: business.id } })).balance === 25, JSON.stringify(replay.body));

  // ================================================================ an unsigned webhook is refused
  const forged = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "evt_e2e_credits_forged", type: "checkout.session.completed", data: { object: { id: order.stripeSessionId, payment_status: "paid", metadata: { order_id: order.id } } } }),
  });
  t("an unsigned webhook is refused", forged.status === 400);
  t("…and nothing was granted by it", (await db.creditAccount.findUnique({ where: { businessId: business.id } })).balance === 25);

  // ================================================================ the page reflects it
  // networkidle0 again: the next step clicks a server-action button on this page.
  await page.goto(`${BASE}/owner/business/${business.id}/credits?bought=1`, { waitUntil: "networkidle0" });
  const afterText = await text(page);
  t("the page shows the new balance", /\b25\b/.test(afterText));
  t("…thanks them without claiming more than it knows", /payment went through/i.test(afterText));
  t("…and the ledger shows what they bought, with the reason", /Bought/.test(afterText) && /25/.test(afterText));
  t("the zero-credit warning is gone", !/not receiving job requests/i.test(afterText));

  // ================================================================ the field itself
  //
  // The server refuses a fractional quantity outright, and that was a real bug: 7.9 quietly sold 7 credits
  // until this batch. It is proven in `test-credit-purchase.ts`.
  //
  // My first attempt to drive it from here set `input[name="quantity"]`, which matched the **hidden** field
  // inside one of the preset pack forms rather than the number box — so the suite reached Stripe with a
  // perfectly valid quantity and told me about my own selector. Scoped by id now, and what is asserted is
  // the thing that actually protects somebody typing in the box.
  const constraints = await page.$eval("#quantity", (el) => ({
    type: el.type, min: el.min, max: el.max, step: el.step || "1",
  }));
  t("the quantity field is a whole-number field", constraints.type === "number" && constraints.step === "1", JSON.stringify(constraints));
  t("…with the same floor and ceiling the server enforces", constraints.min === "5" && constraints.max === "200", JSON.stringify(constraints));
  t("no extra order was created by looking at it", (await db.order.count({ where: { businessId: business.id } })) === 1);

  await page.close();
} finally {
  await browser.close();
  mock.close();
  await cleanup();
  await db.$disconnect();
}

console.log(fail === 0 ? "\nALL CREDIT E2E CHECKS PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
