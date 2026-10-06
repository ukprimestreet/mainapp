// Commerce / monetisation end-to-end tests.
// The Next server must run with STRIPE_SECRET_KEY=sk_test_e2e STRIPE_WEBHOOK_SECRET=whsec_e2e_test STRIPE_API_BASE=http://127.0.0.1:3998
// (this script runs the mock Stripe API on :3998). Use `npm run start:test`-equivalent env.
import http from "http";
import puppeteer from "puppeteer-core";
import { createHmac, randomBytes, createHash } from "crypto";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ENV = readFileSync(".env", "utf8");
const PW = ENV.match(/ADMIN_PASSWORD="(.*)"/)[1], ADMIN_EMAIL = ENV.match(/ADMIN_EMAIL="(.*)"/)[1];
const WHSEC = "whsec_e2e_test";
const db = new PrismaClient();
let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (x) => createHash("sha256").update(x).digest("hex");
const HUMAN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const DAY = 86400_000;

// ---------------- mock Stripe API ----------------
const stripeCalls = [];
let sessionN = 0;
const mock = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    const params = Object.fromEntries(new URLSearchParams(b));
    stripeCalls.push({ path: req.url, auth: req.headers.authorization, ct: req.headers["content-type"], params });
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/checkout/sessions") { if (params["line_items[0][price]"] === "price_boom") return send(400, { error: { message: "No such price: price_boom" } }); const id = `cs_e2e_${++sessionN}`; return send(200, { id, url: `https://checkout.stripe.test/pay/${id}` }); }
    if (req.url === "/billing_portal/sessions") return send(200, { url: "https://billing.stripe.test/p/xyz" });
    send(404, { error: { message: "unknown" } });
  });
});
await new Promise((r) => mock.listen(3998, "127.0.0.1", r));
const sign = (raw, tSec = Math.floor(Date.now() / 1000), secret = WHSEC) => `t=${tSec},v1=${createHmac("sha256", secret).update(`${tSec}.${raw}`).digest("hex")}`;
let evN = 0;
const webhook = async (type, object, opts = {}) => {
  const raw = opts.raw ?? JSON.stringify({ id: opts.id ?? `evt_e2e_${++evN}_${Date.now()}`, type, data: { object } });
  const r = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", ...(opts.noSig ? {} : { "stripe-signature": opts.sig ?? sign(raw, opts.t, opts.secret) }) }, body: raw });
  return { status: r.status, body: await r.json().catch(() => ({})), id: (()=>{try{return JSON.parse(raw).id}catch{return null}})() };
};

const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
process.on("uncaughtException", async (e) => { console.log("CRASH", String(e).slice(0, 400)); try { await browser.close(); } catch {} process.exit(1); });
async function newPage() {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); await page.setViewport({ width: 1280, height: 1000 }); await page.setUserAgent(HUMAN);
  return {
    page, go: (p) => page.goto(BASE + p, { waitUntil: "networkidle0" }), text: () => page.evaluate(() => document.body.innerText),
    setv: (sel, v) => page.$eval(sel, (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, v),
    click: async (label, scope) => { await page.evaluate((l, sc) => { const has = (x) => [...x.querySelectorAll("button,a")].some((y) => y.innerText.trim().split(String.fromCharCode(10))[0] === l); const root = sc ? [...document.querySelectorAll("li,div,article,section,form,tr")].filter((x) => x.innerText.toLowerCase().includes(sc.toLowerCase()) && has(x)).pop() : document; const b = [...root.querySelectorAll("button,a")].find((x) => x.innerText.trim().split(String.fromCharCode(10))[0] === l); if (!b) throw new Error("no " + l); b.click(); }, label, scope); await sleep(1700); },
  };
}
const admin = await newPage(), owner = await newPage(), free = await newPage(), pub = await newPage();

const city = await db.city.findFirst(), hk = await db.location.findUnique({ where: { slug: "hackney" } }), cmd = await db.location.findUnique({ where: { slug: "camden" } });
const cl = await db.category.findUnique({ where: { slug: "cleaning" } }), cf = await db.category.findUnique({ where: { slug: "cafes" } });
const wipe = async () => {
  const ids = (await db.business.findMany({ where: { slug: { startsWith: "e2e-com-" } }, select: { id: true } })).map((b) => b.id);
  await db.campaign.deleteMany({ where: { OR: [{ businessId: { in: ids } }, { advertiser: { startsWith: "E2E" } }] } });
  await db.lead.deleteMany({ where: { businessId: { in: ids } } }); await db.order.deleteMany({ where: { businessId: { in: ids } } });
  await db.subscription.deleteMany({ where: { businessId: { in: ids } } }); await db.review.deleteMany({ where: { businessId: { in: ids } } });
  await db.businessClick.deleteMany({ where: { businessId: { in: ids } } }); await db.businessOwner.deleteMany({ where: { businessId: { in: ids } } });
  await db.business.deleteMany({ where: { id: { in: ids } } });
  await db.owner.deleteMany({ where: { email: { endsWith: "@e2ecom.example" } } });
  await db.salesEnquiry.deleteMany({ where: { email: { endsWith: "@e2ecom.example" } } });
  await db.sponsorship.deleteMany({ where: { sponsorName: { startsWith: "E2E" } } });
  await db.article.deleteMany({ where: { slug: { startsWith: "e2e-com-" } } });
  await db.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_e2e_" } } });
  await db.emailOutbox.deleteMany(); await db.auditLog.deleteMany({ where: { targetType: { in: ["Product", "Subscription", "Campaign", "Sponsorship"] } } });
  await db.product.updateMany({ data: { active: false, pricePence: 0, stripePriceId: null } });
};
await wipe();
const mkb = (slug, name, o = {}) => db.business.create({ data: { slug: `e2e-com-${slug}`, name, summary: "An e2e commerce test business.", description: "A locally run business serving customers across the borough with care and attention to detail.", cityId: city.id, locationId: hk.id, categoryId: cl.id, isSample: false, ...o } });
const alpha = await mkb("alpha", "E2E Com Alpha", { website: "https://alpha-e2e.example", phone: "020 7946 0300", address: "1 Test Street", postcode: "E8 3AA", claimStatus: "CLAIMED" });
const beta = await mkb("beta", "E2E Com Beta", { claimStatus: "UNCLAIMED" });
const gamma = await mkb("gamma", "E2E Com Gamma", { locationId: cmd.id, categoryId: cf.id });
const freeBiz = await mkb("free", "E2E Com Free", { categoryId: cf.id, claimStatus: "CLAIMED", phone: "020 7946 0301" });
const mkOwner = async (email, name, biz) => { const o = await db.owner.create({ data: { email, name } }); await db.businessOwner.create({ data: { ownerId: o.id, businessId: biz.id } }); return o; };
const oOwner = await mkOwner("olive@e2ecom.example", "Olive Owner", alpha), fOwner = await mkOwner("fred@e2ecom.example", "Fred Free", freeBiz);
async function loginAs(p, o) { const raw = randomBytes(18).toString("base64url"); await db.ownerLoginToken.create({ data: { ownerId: o.id, tokenHash: sha(raw), expiresAt: new Date(Date.now() + 600000) } }); await p.go(`/owner/login/${raw}`); await p.click("Sign in"); }
const status = async (p, o = {}) => (await fetch(BASE + p, { redirect: "manual", headers: { "user-agent": HUMAN }, ...o })).status;
const loc = async (p, ua = HUMAN) => { const r = await fetch(BASE + p, { redirect: "manual", headers: { "user-agent": ua } }); return { status: r.status, to: r.headers.get("location") }; };
const html = async (p, ua = HUMAN) => (await fetch(BASE + p, { headers: { "user-agent": ua } })).text();
const clicks = async (id, kind) => (await db.businessClick.aggregate({ where: { businessId: id, kind }, _sum: { count: true } }))._sum.count ?? 0;
const stat = async (id) => { const r = await db.campaignStat.aggregate({ where: { campaignId: id }, _sum: { impressions: true, clicks: true } }); return { imp: r._sum.impressions ?? 0, clk: r._sum.clicks ?? 0 }; };
const organicNames = async (p) => (await pub.go(p), pub.page.evaluate(() => [...document.querySelectorAll("section h3 a, section h2 a")].map((a) => a.innerText)));

// ============================================================ A. products + advertise page
await admin.go("/admin/login"); await admin.page.type("#email", ADMIN_EMAIL); await admin.page.type("#password", PW);
await Promise.all([admin.page.click('form:has(#password) button'), admin.page.waitForFunction(() => location.pathname === "/admin")]);
t("commerce admin requires login", [302, 307, 308].includes(await status("/admin/commerce")));
await admin.go("/admin/commerce");
let tx = await admin.text();
t("products seeded INACTIVE at £0; payments configured shown with webhook URL", (await admin.page.$eval("input[name=name]", e => e.value)).includes("Premium profile") && tx.includes("placeholders at £0 and inactive") && tx.includes("Online payments (Stripe) configured") && tx.includes("/api/stripe/webhook"));
const prod = async (key) => db.product.findUnique({ where: { key } });
const saveProd = async (key, f) => { await admin.go("/admin/commerce"); const id = (await prod(key)).id; await admin.page.evaluate((id, f) => { const form = [...document.querySelectorAll("form")].find((x) => x.querySelector(`input[name=id][value="${id}"]`)); for (const [k, v] of Object.entries(f)) { const el = form.querySelector(`[name="${k}"]`); if (el.type === "checkbox") el.checked = v; else el.value = v; } form.querySelector("button").click(); }, id, f); await sleep(1700); };
await saveProd("premium_monthly", { active: true });
t("can't activate a product at £0", (await admin.text()).includes("set a real price before activating") && !(await prod("premium_monthly")).active);
await saveProd("premium_monthly", { priceGbp: "-5", active: false });
t("negative price refused", (await admin.text()).includes("price must be between"));
await saveProd("premium_monthly", { priceGbp: "29", stripePriceId: "price_e2e_premium", active: true });
await saveProd("featured_30d", { priceGbp: "49", stripePriceId: "price_e2e_feat", durationDays: "30", active: true });
await saveProd("featured_7d", { priceGbp: "19", durationDays: "400", active: true });
t("featured duration must be 1–365 days", (await admin.text()).includes("duration must be 1–365") && !(await prod("featured_7d")).active);
await saveProd("featured_7d", { priceGbp: "19", durationDays: "7", stripePriceId: "", active: true });
t("product saved: price in pence, live", (await prod("premium_monthly")).pricePence === 2900 && (await prod("premium_monthly")).active && (await prod("featured_7d")).durationDays === 7);
await pub.go("/advertise");
tx = await pub.text();
t("/advertise lists ACTIVE products with price + VAT note; policy and promise visible", tx.includes("Premium profile — monthly") && tx.includes("£29") && tx.includes("+ VAT") && tx.includes("Featured placement — 30 days") && tx.includes("£49") && tx.includes("advertising & sponsorship promise") && tx.includes("never") );
await saveProd("featured_7d", { active: false });
t("deactivated product disappears from /advertise", !(await html("/advertise")).includes("Featured placement — 7 days"));
await saveProd("featured_7d", { active: true });

// enquiry form
await pub.go("/advertise");
await pub.setv("#enq-name", "Ed"); await pub.setv("#enq-email", "ed@e2ecom.example"); await pub.setv("#enq-interest", "premium"); await pub.setv("#enq-message", "Interested in a premium profile for my shop.");
await pub.click("Send enquiry");
t("enquiry: bot-speed submit refused", (await pub.text()).includes("very quick") && (await db.salesEnquiry.count({ where: { email: "ed@e2ecom.example" } })) === 0);
await pub.go("/advertise"); await sleep(2800);
await pub.setv("#enq-name", "E"); await pub.setv("#enq-email", "nope"); await pub.click("Send enquiry");
tx = await pub.text();
t("enquiry: validation (name, email, interest, message)", tx.includes("Enter your name") && tx.includes("valid email") && tx.includes("what you're interested in") && tx.includes("little about what you need"));
await pub.go("/advertise"); await sleep(2800);
await pub.page.$eval('input[name="fax_site"]', (e) => (e.value = "x")); await pub.setv("#enq-name", "Bot"); await pub.setv("#enq-email", "bot@e2ecom.example"); await pub.setv("#enq-interest", "other"); await pub.setv("#enq-message", "spam spam spam spam spam"); await pub.click("Send enquiry");
t("enquiry: honeypot looks successful, stores nothing", (await pub.text()).includes("be in touch") && (await db.salesEnquiry.count({ where: { email: "bot@e2ecom.example" } })) === 0);
await pub.go("/advertise"); await sleep(2800);
await pub.setv("#enq-name", "Ed Enquirer"); await pub.setv("#enq-company", "Ed Ltd"); await pub.setv("#enq-email", "ED@e2ecom.example"); await pub.setv("#enq-interest", "sponsorship"); await pub.setv("#enq-message", "Interested in sponsoring the podcast next quarter."); await pub.click("Send enquiry");
const enq = await db.salesEnquiry.findFirst({ where: { email: "ed@e2ecom.example" } });
t("enquiry: stored (email lower-cased) and the admin is emailed", !!enq && enq.interest === "sponsorship" && (await db.emailOutbox.count({ where: { to: ADMIN_EMAIL, subject: { contains: "sponsorship enquiry" } } })) === 1);
await admin.go("/admin/commerce/enquiries");
t("admin enquiries lists it; status can change", (await admin.text()).includes("Ed Enquirer") && (await admin.text()).includes("Ed Ltd"));
await admin.click("Mark contacted");
t("enquiry status → CONTACTED", (await db.salesEnquiry.findUnique({ where: { id: enq.id } })).status === "CONTACTED");

// ============================================================ B. manual premium + gating
await admin.go("/admin/commerce/subscriptions");
const grant = async (slug, until, note) => { await admin.go("/admin/commerce/subscriptions"); await admin.setv("#g-slug", slug); await admin.setv("#g-until", until); await admin.setv("#g-note", note); await admin.click("Grant"); return admin.text(); };
const iso = (d) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);
t("grant: unknown slug refused", (await grant("nope-nope", iso(30), "inv-1")).includes("Business not found"));
const sample = await db.business.findFirst({ where: { isSample: true } });
t("grant: sample businesses can't be given paid plans", (await grant(sample.slug, iso(30), "inv-1")).includes("Sample businesses can't"));
t("grant: past end date refused", (await grant("e2e-com-alpha", iso(-2), "inv-1")).includes("future"));
t("grant: a note is mandatory (audit trail)", (await grant("e2e-com-alpha", iso(30), "")).includes("Add a note"));
t("grant: nothing was created by the refusals", (await db.subscription.count({ where: { businessId: alpha.id } })) === 0);
t("grant: Premium granted → table shows MANUAL plan with note", (await grant("e2e-com-alpha", iso(30), "INV-2026-001")).includes("Premium granted") && (await admin.text()).includes("INV-2026-001") && (await admin.text()).includes("MANUAL"));

await loginAs(owner, oOwner); await loginAs(free, fOwner);
await owner.go(`/owner/business/${alpha.id}/promote`);
tx = await owner.text();
t("owner (premium): plan shown as Premium, arranged with our team; settings form present; independence note visible", tx.includes("Premium") && tx.includes("arranged with our team") && !!(await owner.page.$("#gallery")) && tx.includes("never changes your rating"));
await free.go(`/owner/business/${freeBiz.id}/promote`);
tx = await free.text();
t("owner (free): Free profile; premium settings + analytics are teasers only", tx.includes("Free profile") && (await free.page.$("#gallery")) === null && tx.includes("unlock with Premium") && tx.includes("Premium shows how many people"));
// settings validation
await owner.setv("#gallery", "http://insecure.example/a.jpg"); await owner.click("Save");
t("settings: non-https image refused", (await owner.text()).includes("valid https image"));
await owner.go(`/owner/business/${alpha.id}/promote`); await owner.setv("#gallery", Array.from({ length: 9 }, (_, i) => `https://img.example/${i}.jpg`).join("\n")); await owner.click("Save");
t("settings: more than 8 images refused", (await owner.text()).includes("At most 8 images"));
await owner.go(`/owner/business/${alpha.id}/promote`); await owner.setv("#promoText", "<b>Sale</b>"); await owner.setv("#promoUrl", "javascript:alert(1)"); await owner.click("Save");
tx = await owner.text();
t("settings: HTML in offer and javascript: link refused", tx.includes("No HTML") && tx.includes("valid web address"));
await owner.go(`/owner/business/${alpha.id}/promote`); await owner.setv("#promoText", "x".repeat(141)); await owner.click("Save");
t("settings: offer over 140 chars refused", (await owner.text()).includes("140 characters"));
await owner.go(`/owner/business/${alpha.id}/promote`);
await owner.setv("#gallery", "https://img.example/one.jpg\nhttps://img.example/two.jpg\nhttps://img.example/one.jpg"); await owner.setv("#promoText", "10% off deep cleans this month"); await owner.setv("#promoUrl", "https://alpha-e2e.example/offer"); await owner.click("Save");
const aSaved = await db.business.findUnique({ where: { id: alpha.id } });
t("settings saved: de-duplicated gallery, offer, logged edit", JSON.parse(aSaved.gallery).length === 2 && aSaved.promoText.startsWith("10% off") && (await db.businessEditLog.count({ where: { businessId: alpha.id } })) >= 1);
await pub.go("/businesses/london/cleaning/e2e-com-alpha");
tx = await pub.text();
t("public profile (premium): gallery with descriptive alts, labelled offer with sponsored link, enquiry form", await pub.page.evaluate(() => { const imgs = [...document.querySelectorAll('[data-premium="gallery"] img')]; const promo = document.querySelector('[data-premium="promo"]'); return imgs.length === 2 && imgs[0].alt === "E2E Com Alpha photo 1" && !!promo && promo.innerText.toLowerCase().includes("offer from e2e com alpha") && /sponsored/.test(promo.querySelector("a").rel) && !!document.querySelector('[data-premium="enquiry"] form'); }));
t("no pay-to-look-trusted badge: nothing says 'Premium' on the public profile", !tx.toUpperCase().includes("PREMIUM"));
t("integrity: Similar businesses and the Reviews section are still shown on a premium profile", tx.includes("Similar businesses") && tx.includes("Reviews"));
await free.go("/businesses/london/cafes/e2e-com-free");
t("public profile (free): no gallery, no offer, no enquiry form", await free.page.evaluate(() => !document.querySelector("[data-premium]")));

// revoke -> features hide immediately; data retained
await admin.go("/admin/commerce/subscriptions"); await admin.click("End now");
t("revoking Premium hides premium features on the profile immediately", await (async () => { await pub.go("/businesses/london/cleaning/e2e-com-alpha"); return pub.page.evaluate(() => !document.querySelector("[data-premium]")); })() && (await db.business.findUnique({ where: { id: alpha.id } })).promoText !== null);
await owner.go(`/owner/business/${alpha.id}/promote`);
t("…and the owner is back on the Free plan (settings hidden, data kept)", (await owner.text()).includes("Free profile") && (await owner.page.$("#gallery")) === null);
await grant("e2e-com-alpha", iso(30), "INV-2026-002");
await pub.go("/businesses/london/cleaning/e2e-com-alpha");
t("re-granting restores the saved gallery/offer", await pub.page.evaluate(() => !!document.querySelector('[data-premium="gallery"]') && !!document.querySelector('[data-premium="promo"]')));

// ============================================================ C. leads
await pub.go("/businesses/london/cleaning/e2e-com-alpha");
const fillLead = async (o) => { for (const [k, v] of Object.entries(o)) await pub.setv(`#lead-${k}`, v); };
await fillLead({ name: "Lena Lead", email: "lena@e2ecom.example", message: "Hello, could you quote for a deep clean of a two-bed flat?" }); await pub.click("Send enquiry");
t("lead: bot-speed submit refused", (await pub.text()).includes("very quick") && (await db.lead.count({ where: { businessId: alpha.id } })) === 0);
await pub.go("/businesses/london/cleaning/e2e-com-alpha"); await sleep(3400);
await fillLead({ name: "L", email: "bad", message: "short" }); await pub.click("Send enquiry");
tx = await pub.text();
t("lead: validation errors (name, email, message length)", tx.includes("Enter your name") && tx.includes("valid email") && tx.includes("at least 20 characters"));
await pub.go("/businesses/london/cleaning/e2e-com-alpha"); await sleep(3400);
await fillLead({ name: "Mal", email: "mal@mailinator.com", message: "Please call me about your cleaning services today." }); await pub.click("Send enquiry");
t("lead: disposable email refused", (await pub.text()).includes("permanent email") && (await db.lead.count({ where: { businessId: alpha.id } })) === 0);
await pub.go("/businesses/london/cleaning/e2e-com-alpha"); await sleep(3400);
await pub.page.$eval('input[name="company_site"]', (e) => (e.value = "x")); await fillLead({ name: "Bot", email: "bot@e2ecom.example", message: "Buy cheap pills now, the best prices anywhere." }); await pub.click("Send enquiry");
t("lead: honeypot looks successful, stores nothing", (await pub.text()).includes("enquiry has been sent") && (await db.lead.count({ where: { businessId: alpha.id } })) === 0);
await pub.go("/businesses/london/cleaning/e2e-com-alpha"); await sleep(3400);
await fillLead({ name: "Lena Lead", email: "Lena@E2ECom.example", phone: "07700 900123", message: "Hello, could you quote for a deep clean of a two-bed flat?" }); await pub.click("Send enquiry");
const lead = await db.lead.findFirst({ where: { businessId: alpha.id } });
t("lead: stored, success shown; email to the OWNER (not the visitor) with the details", !!lead && (await pub.text()).includes("enquiry has been sent") && lead.email === "lena@e2ecom.example" && (await db.emailOutbox.count({ where: { to: "olive@e2ecom.example", subject: { contains: "New enquiry for E2E Com Alpha" }, body: { contains: "deep clean of a two-bed flat" } } })) === 1 && (await db.emailOutbox.count({ where: { to: "lena@e2ecom.example" } })) === 0);
await db.lead.createMany({ data: [1, 2].map((i) => ({ businessId: alpha.id, name: "Lena", email: "lena@e2ecom.example", message: "earlier message number " + i + " for the limit", ipHash: "z" + i })) });
await pub.go("/businesses/london/cleaning/e2e-com-alpha"); await sleep(3400);
await fillLead({ name: "Lena Lead", email: "lena@e2ecom.example", message: "Another follow up enquiry from the same person." }); await pub.click("Send enquiry");
t("lead: 3 per email per business per day limit", (await pub.text()).includes("several enquiries") && (await db.lead.count({ where: { businessId: alpha.id, email: "lena@e2ecom.example" } })) === 3);
await owner.go(`/owner/business/${alpha.id}/leads`);
t("owner sees leads with contact details", (await owner.text()).includes("Lena Lead") && (await owner.text()).includes("07700 900123"));
await owner.click("Mark read", "Lena Lead");
t("owner can mark read / archive", (await db.lead.findFirst({ where: { businessId: alpha.id, phone: "07700 900123" } })).status === "READ");
await free.go(`/owner/business/${alpha.id}/leads`);
t("another owner can't open this business's leads (404)", (await free.text()).includes("couldn't find") || (await free.text()).includes("404"));
await free.go(`/owner/business/${freeBiz.id}/leads`);
await free.page.evaluate((id) => { const f = document.createElement("form"); }, lead.id);
t("lead tampering: free owner's leads page is empty and the other business's lead is untouched", (await free.text()).includes("No enquiries yet") && (await db.lead.findUnique({ where: { id: lead.id } })).status !== "ARCHIVED");

// ============================================================ D. click tracking
const ua = (s) => s;
const w0 = await clicks(alpha.id, "website");
let r = await loc(`/go/biz/${alpha.id}/website`);
t("website click: 302 to the stored website, counted once", r.status === 302 && r.to === "https://alpha-e2e.example/" && (await clicks(alpha.id, "website")) === w0 + 1);
await loc(`/go/biz/${alpha.id}/website`, "Googlebot/2.1"); await loc(`/go/biz/${alpha.id}/website`, "python-requests/2");
t("website click: bots not counted", (await clicks(alpha.id, "website")) === w0 + 1);
r = await loc(`/go/biz/${alpha.id}/directions`);
t("directions click: Google Maps URL built from the business, counted", r.status === 302 && r.to.startsWith("https://www.google.com/maps/search/?api=1&query=") && decodeURIComponent(r.to).includes("E2E Com Alpha") && (await clicks(alpha.id, "directions")) === 1);
t("tracked route can't be abused: bad kind / unknown / unpublished / no website → home", (await loc(`/go/biz/${alpha.id}/evil`)).to.endsWith("/") && (await loc(`/go/biz/nope/website`)).to.endsWith("/") && (await loc(`/go/biz/${beta.id}/website`)).to.endsWith("/"));
await db.business.update({ where: { id: beta.id }, data: { website: "https://beta.example", published: false } });
t("unpublished business: tracked redirect refused", (await loc(`/go/biz/${beta.id}/website`)).to.endsWith("/"));
await db.business.update({ where: { id: beta.id }, data: { published: true } });
const beacon = (body, h = {}) => fetch(`${BASE}/api/track/click`, { method: "POST", headers: { "content-type": "application/json", "user-agent": HUMAN, ...h }, body: typeof body === "string" ? body : JSON.stringify(body) });
t("phone beacon: 204 and counted", (await beacon({ id: alpha.id, kind: "phone" })).status === 204 && (await clicks(alpha.id, "phone")) === 1);
await beacon({ id: alpha.id, kind: "phone" }, { "user-agent": "Googlebot/2.1" }); await beacon({ id: alpha.id, kind: "phone" }, { origin: "https://evil.example" }); await beacon({ id: alpha.id, kind: "website" }); await beacon("junk"); await beacon({ id: beta.id, kind: "phone" });
t("phone beacon: bots, foreign origins, wrong kind, junk and businesses without a phone are ignored", (await clicks(alpha.id, "phone")) === 1 && (await clicks(beta.id, "phone")) === 0);
t("phone beacon rejects GET", (await fetch(`${BASE}/api/track/click`)).status === 405);
await pub.go("/businesses/london/cleaning/e2e-com-alpha");
t("profile links: website + directions go through the counter; phone is a real tel: link", await pub.page.evaluate((id) => !!document.querySelector(`a[href="/go/biz/${id}/website"]`) && !!document.querySelector(`a[href="/go/biz/${id}/directions"]`) && !!document.querySelector('a[href^="tel:"]'), alpha.id));
await owner.go(`/owner/business/${alpha.id}/promote`);
tx = await owner.text();
t("owner (premium) sees click analytics", /website clicks\s*\n?\s*1/i.test(tx) || (tx.toLowerCase().includes("website clicks") && tx.includes("phone clicks") && tx.includes("directions clicks")));
t("analytics numbers match (website 1, phone 1, directions 1)", await owner.page.evaluate(() => [...document.querySelectorAll("dl > div")].filter((d) => /clicks/i.test(d.innerText)).map((d) => d.innerText.replace(/\s+/g, " ")).join("|").match(/1/g)?.length >= 3));

// ============================================================ E. featured campaigns
const camp = async (f) => { await admin.go("/admin/commerce/campaigns"); await admin.page.evaluate((f) => { for (const [k, v] of Object.entries(f)) { const el = document.querySelector(`form [name="${k}"]`); el.value = v; } [...document.querySelectorAll("button")].find((b) => b.innerText === "Create campaign").click(); }, { kind: "FEATURED", startsAt: iso(-1), endsAt: iso(10), impressionCap: "", slug: "", categoryId: "", locationId: "", advertiser: "", placement: "HOME", linkUrl: "", headline: "", imageUrl: "", body: "", ...f }); await sleep(1800); return admin.text(); };
t("campaign: unknown business refused", (await camp({ slug: "nope-nope" })).includes("Business not found"));
t("campaign: SAMPLE business can't be promoted", (await camp({ slug: sample.slug })).includes("Sample (fictional) businesses can't be promoted"));
t("campaign: end before start refused; absurd length refused; low cap refused", (await camp({ slug: "e2e-com-beta", startsAt: iso(5), endsAt: iso(2) })).includes("end date after") && (await camp({ slug: "e2e-com-beta", endsAt: iso(500) })).includes("at most 400 days") && (await camp({ slug: "e2e-com-beta", impressionCap: "10" })).includes("100 or more"));
t("campaign: nothing created by refusals", (await db.campaign.count({ where: { businessId: beta.id } })) === 0);
const before = await organicNames("/businesses/london/cleaning");
t("featured slot absent before any campaign", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')));
t("campaign created: featured Beta, targeting Cleaning + Hackney", (await camp({ slug: "e2e-com-beta", categoryId: cl.id, locationId: hk.id })).includes("Featured campaign created"));
const fc = await db.campaign.findFirst({ where: { businessId: beta.id } });
await pub.go("/locations/hackney/cleaning");
t("featured slot on the matching area × category page: labelled Sponsored + 'paid placement', link via counter with rel=sponsored", await pub.page.evaluate((id) => { const a = document.querySelector('[data-sponsored="featured"]'); if (!a) return false; const l = a.querySelector("a"); return /Sponsored/i.test(a.innerText) && /paid placement/i.test(a.innerText) && a.innerText.includes("E2E Com Beta") && l.getAttribute("href") === `/go/campaign/${id}` && /sponsored/.test(l.rel); }, fc.id));
await pub.go("/locations/hackney");
t("area page renders fine with a category+area campaign present", (await pub.text()).length > 200);
await pub.go("/businesses/london/cleaning");
t("category-wide page: area-targeted campaign does NOT appear", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')));
await pub.go("/locations/camden"); t("other area: not shown", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')));
await pub.go("/locations/camden/cafes"); t("other category/area: not shown", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')));
await pub.go("/search?q=cleaning");
t("search for a category shows the labelled slot only when relevant (category-targeted + area-targeted campaign: not shown on a category-only slot)", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')));
// organic order unaffected: compare organic grid before/after (location page where it shows)
await db.campaign.update({ where: { id: fc.id }, data: { locationId: null } });
const afterNames = await organicNames("/businesses/london/cleaning");
t("INTEGRITY: organic list is identical with and without the paid placement", JSON.stringify(before) === JSON.stringify(afterNames), JSON.stringify([before.slice(0, 4), afterNames.slice(0, 4)]));
t("category-wide campaign now shows on the category page", await pub.page.evaluate(() => !!document.querySelector('[data-sponsored="featured"]')));
await pub.go("/search?q=cleaning");
t("search: sponsored slot appears for a category query, above organic results", await pub.page.evaluate(() => { const a = document.querySelector('[data-sponsored="featured"]'); const biz = document.getElementById("biz"); return !!a && !!biz && (a.compareDocumentPosition(biz) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; }));
const orgSearch1 = await pub.page.evaluate(() => [...document.querySelectorAll("#biz ~ div article h3 a, section[aria-labelledby=biz] article h3 a")].map((a) => a.innerText));
await db.campaign.update({ where: { id: fc.id }, data: { status: "PAUSED" } });
await pub.go("/search?q=cleaning");
t("INTEGRITY: organic search order identical with the campaign paused", JSON.stringify(orgSearch1) === JSON.stringify(await pub.page.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=biz] article h3 a")].map((a) => a.innerText))) && await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')));
await db.campaign.update({ where: { id: fc.id }, data: { status: "ACTIVE" } });
// impressions + clicks
const s0 = await stat(fc.id);
await html("/businesses/london/cleaning"); await html("/businesses/london/cleaning", "Googlebot/2.1"); await html("/businesses/london/cleaning", "python-requests/2");
t("impressions: human render +1, bots ignored", (await stat(fc.id)).imp - s0.imp === 1);
r = await loc(`/go/campaign/${fc.id}`);
t("click: 302 to the business profile (internal), counted", r.status === 302 && r.to.endsWith("/businesses/london/cleaning/e2e-com-beta") && (await stat(fc.id)).clk === 1);
await loc(`/go/campaign/${fc.id}`, "Googlebot/2.1");
t("click: bots not counted", (await stat(fc.id)).clk === 1);
t("click tracker never redirects from a parameter (open-redirect safe)", (await loc(`/go/campaign/${fc.id}?to=https://evil.example&url=https://evil.example`)).to.endsWith("/businesses/london/cleaning/e2e-com-beta") && (await loc("/go/campaign/nope")).to.endsWith("/"));
// founder disclosure
await db.business.update({ where: { id: beta.id }, data: { ownedByFounder: true } });
await pub.go("/businesses/london/cleaning");
t("founder-owned business: automatic disclosure inside the sponsored slot", (await pub.text()).includes("Disclosure: owned by PrimeStreet's founder"));
await db.business.update({ where: { id: beta.id }, data: { ownedByFounder: false } });
// max two slots + cap + pause/end
const c2 = await db.campaign.create({ data: { kind: "FEATURED", businessId: gamma.id, categoryId: null, locationId: null, endsAt: new Date(Date.now() + 5 * DAY) } });
const c3 = await db.campaign.create({ data: { kind: "FEATURED", businessId: alpha.id, categoryId: null, locationId: null, endsAt: new Date(Date.now() + 5 * DAY) } });
await pub.go("/businesses/london/cleaning");
t("at most 2 sponsored businesses per slot", (await pub.page.$$eval('[data-sponsored="featured"] li', (l) => l.length)) === 2);
await db.campaign.deleteMany({ where: { id: { in: [c2.id, c3.id] } } });
await db.campaignStat.create({ data: { campaignId: fc.id, day: "2020-01-01", impressions: 5000 } }); await db.campaign.update({ where: { id: fc.id }, data: { impressionCap: 100 } });
await pub.go("/businesses/london/cleaning");
t("impression cap reached → campaign stops showing", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')));
await db.campaign.update({ where: { id: fc.id }, data: { impressionCap: null } });
await admin.go("/admin/commerce/campaigns");
t("admin campaigns table shows impressions, clicks and CTR", (await admin.text()).includes("E2E Com Beta") && /\d+\s*%/.test(await admin.text()));
await admin.click("Pause", "E2E Com Beta");
await pub.go("/businesses/london/cleaning"); t("admin pause removes it immediately", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')));
await admin.go("/admin/commerce/campaigns"); await admin.click("Resume", "E2E Com Beta");
await pub.go("/businesses/london/cleaning"); t("resume brings it back", await pub.page.evaluate(() => !!document.querySelector('[data-sponsored="featured"]')));
await admin.go("/admin/commerce/campaigns"); await admin.click("End", "E2E Com Beta");
await pub.go("/businesses/london/cleaning"); t("ending stops it for good", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="featured"]')) && (await db.campaign.findUnique({ where: { id: fc.id } })).status === "ENDED");
t("robots.txt keeps crawlers off /go/", (await (await fetch(BASE + "/robots.txt")).text()).includes("Disallow: /go/"));

// ============================================================ F. advertisements
t("ad: http destination refused", (await camp({ kind: "AD", advertiser: "E2E Adco", headline: "Spring cleaning offer", linkUrl: "http://adco.example/x", placement: "HOME" })).includes("https address"));
t("ad: HTML in copy refused", (await camp({ kind: "AD", advertiser: "E2E Adco", headline: "<b>Spring</b> offer", linkUrl: "https://adco.example/x", placement: "HOME" })).includes("No HTML"));
t("ad: headline length and image scheme checked", (await camp({ kind: "AD", advertiser: "E2E Adco", headline: "Hi", linkUrl: "https://adco.example/x", placement: "HOME" })).includes("5–90") && (await camp({ kind: "AD", advertiser: "E2E Adco", headline: "Good headline here", linkUrl: "https://adco.example/x", imageUrl: "http://img.example/a.jpg", placement: "HOME" })).includes("Image must be an https"));
t("ad: valid ad created (HOME)", (await camp({ kind: "AD", advertiser: "E2E Adco", headline: "Spring cleaning offer for London homes", body: "Book before the end of the month.", linkUrl: "https://adco.example/offer", placement: "HOME" })).includes("Ad created"));
const ad = await db.campaign.findFirst({ where: { advertiser: "E2E Adco" } });
await pub.go("/");
t("home: ad labelled 'Advertisement' with the advertiser, link via the tracker with rel=sponsored nofollow noopener", await pub.page.evaluate((id) => { const a = document.querySelector('[data-sponsored="ad"]'); if (!a) return false; const l = a.querySelector("a"); return /Advertisement/i.test(a.innerText) && a.innerText.toLowerCase().includes("e2e adco") && l.getAttribute("href") === `/go/campaign/${id}` && ["sponsored", "nofollow", "noopener"].every((x) => l.rel.includes(x)); }, ad.id));
t("no third-party scripts anywhere on a page that carries an ad", await pub.page.evaluate(() => [...document.querySelectorAll("script[src]")].every((s) => new URL(s.src, location.href).origin === location.origin)));
const a0 = await stat(ad.id); await html("/"); await html("/", "Googlebot/2.1");
t("ad impressions: humans only", (await stat(ad.id)).imp - a0.imp === 1);
r = await loc(`/go/campaign/${ad.id}?to=https://evil.example`);
t("ad click: 302 to the STORED destination (parameter ignored), counted", r.status === 302 && r.to === "https://adco.example/offer" && (await stat(ad.id)).clk === 1);
await loc(`/go/campaign/${ad.id}`, "Googlebot/2.1"); t("ad click: bots ignored", (await stat(ad.id)).clk === 1);
await db.campaign.update({ where: { id: ad.id }, data: { placement: "ARTICLE" } });
const edArt = await db.article.findFirst({ where: { isSample: true, disclosure: "EDITORIAL", type: "NEWS" } });
await pub.go(`/news/${edArt.slug}`); t("ARTICLE ad shows under editorial articles", await pub.page.evaluate(() => !!document.querySelector('[data-sponsored="ad"]')));
const author = await db.author.findFirst();
const spArt = await db.article.create({ data: { slug: "e2e-com-sponsored", type: "NEWS", title: "E2E Com sponsored piece", standfirst: "s".repeat(40), body: "b".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - 3600_000), authorId: author.id, isSample: false, disclosure: "SPONSORED", sponsorName: "Some Sponsor" } });
await pub.go(`/news/${spArt.slug}`); t("INTEGRITY: no ad is placed inside sponsored/partner/advertorial articles (one label per piece)", await pub.page.evaluate(() => !document.querySelector('[data-sponsored="ad"]')) && (await pub.text()).includes("Sponsored content"));
await db.campaign.update({ where: { id: ad.id }, data: { placement: "PODCAST" } });
await pub.go("/podcast/inside-the-business-removals-newham"); t("PODCAST ad shows on episode pages", await pub.page.evaluate(() => !!document.querySelector('[data-sponsored="ad"]')));
await db.campaign.update({ where: { id: ad.id }, data: { placement: "HOME" } });
await admin.go("/admin/commerce/campaigns"); await admin.click("End", "E2E Adco");
t("ended ad: disappears and the tracker sends people home (no dead redirect)", (await loc(`/go/campaign/${ad.id}`)).to.endsWith("/") && !(await html("/")).includes('data-sponsored="ad"'));

// ============================================================ G. sponsorships
const spons = async (f) => { await admin.go("/admin/commerce/sponsorships"); await admin.page.evaluate((f) => { for (const [k, v] of Object.entries(f)) document.querySelector(`form [name="${k}"]`).value = v; [...document.querySelectorAll("button")].find((b) => b.innerText === "Add").click(); }, { kind: "PODCAST", sponsorName: "", website: "", priceGbp: "", episodeSlug: "", startsAt: "", endsAt: "", status: "DRAFT", notes: "", ...f }); await sleep(1700); return admin.text(); };
t("sponsorship: podcast deal needs an episode; unknown episode, bad website, no name refused", (await spons({ sponsorName: "E2E Sponsor" })).includes("needs an episode slug") && (await spons({ sponsorName: "E2E Sponsor", episodeSlug: "nope" })).includes("Episode not found") && (await spons({ sponsorName: "E2E Sponsor", episodeSlug: "inside-the-business-removals-newham", website: "javascript:1" })).includes("valid address") && (await spons({ episodeSlug: "inside-the-business-removals-newham" })).includes("Name the sponsor"));
t("sponsorship: draft deal saved but NOT shown publicly", (await spons({ sponsorName: "E2E Sponsor", episodeSlug: "inside-the-business-removals-newham", website: "https://sponsor.example", priceGbp: "500", status: "DRAFT" })).includes("saved (draft)") && !(await html("/podcast/inside-the-business-removals-newham")).includes("E2E Sponsor"));
const sp = await db.sponsorship.findFirst({ where: { sponsorName: "E2E Sponsor" } });
await admin.go("/admin/commerce/sponsorships");
await admin.page.evaluate((id) => { const f = [...document.querySelectorAll("form")].find((x) => x.querySelector(`input[name=id][value="${id}"]`)); f.querySelector("select").value = "ACTIVE"; f.querySelector("button").click(); }, sp.id); await sleep(1700);
await pub.go("/podcast/inside-the-business-removals-newham");
t("ACTIVE podcast sponsorship: labelled 'Sponsored' + 'sponsored by …' + independence statement + rel=sponsored link", await pub.page.evaluate(() => { const a = document.querySelector('[data-sponsored="sponsorship"]'); return !!a && /Sponsored/i.test(a.innerText) && a.innerText.includes("sponsored by E2E Sponsor") && a.innerText.includes("independent of sponsors") && /sponsored/.test(a.querySelector("a").rel); }));
await admin.go("/admin/commerce/sponsorships");
await admin.page.evaluate((id) => { const f = [...document.querySelectorAll("form")].find((x) => x.querySelector(`input[name=id][value="${id}"]`)); f.querySelector("select").value = "DONE"; f.querySelector("button").click(); }, sp.id); await sleep(1700);
t("finished sponsorship stops showing", !(await html("/podcast/inside-the-business-removals-newham")).includes("E2E Sponsor"));
await admin.click("Mark invoiced");
t("ledger: invoiced flag toggles", (await db.sponsorship.findUnique({ where: { id: sp.id } })).invoiced === true);

// ============================================================ H. Stripe (mock API + signed webhooks)
await free.go(`/owner/business/${freeBiz.id}/promote`);
tx = await free.text();
t("online purchase available: 'Buy online' for products with a Stripe price; 'Request this' for the one without", await free.page.evaluate(() => { const items = [...document.querySelectorAll("ul li")].filter((l) => l.querySelector("h3")); const by = (n) => items.find((l) => l.querySelector("h3").innerText.includes(n)); return !!by("Premium profile — monthly")?.innerText.includes("Buy online") && !!by("Featured placement — 7 days")?.innerText.includes("Request this"); }));
const reqs = []; free.page.on("request", (rq) => { if (/stripe\.test/.test(rq.url())) { reqs.push(rq.url()); rq.abort().catch(() => {}); } }); await free.page.setRequestInterception(true);
free.page.on("request", (rq) => { if (!/stripe\.test/.test(rq.url())) rq.continue().catch(() => {}); });
await free.click("Buy online", "Premium profile — monthly");
const call = stripeCalls.find((c) => c.path === "/checkout/sessions");
const ord = await db.order.findFirst({ where: { businessId: freeBiz.id }, orderBy: { createdAt: "desc" } });
t("checkout: the browser is sent to Stripe's hosted page for the new session", reqs.some((u) => u === `https://checkout.stripe.test/pay/${ord.stripeSessionId}`), JSON.stringify(reqs));
t("checkout: Stripe API call is authenticated, form-encoded, subscription mode with our price", call.auth === "Bearer sk_test_e2e" && call.ct.includes("x-www-form-urlencoded") && call.params.mode === "subscription" && call.params["line_items[0][price]"] === "price_e2e_premium" && call.params["line_items[0][quantity]"] === "1");
t("checkout: success/cancel URLs, customer email, order + business metadata (server-chosen, not from the browser)", call.params.success_url.endsWith(`/owner/business/${freeBiz.id}/promote?paid=1`) && call.params.cancel_url.endsWith("cancelled=1") && call.params.customer_email === "fred@e2ecom.example" && call.params["metadata[business_id]"] === freeBiz.id && call.params.client_reference_id === ord.id && call.params["subscription_data[metadata][order_id]"] === ord.id);
t("checkout: order recorded PENDING with the session id and the price from OUR database", ord.status === "PENDING" && ord.amountPence === 2900 && ord.productKey === "premium_monthly" && /^cs_e2e_/.test(ord.stripeSessionId));
await free.page.setRequestInterception(false);
await db.product.update({ where: { key: "featured_30d" }, data: { stripePriceId: "price_boom" } });
await free.go(`/owner/business/${freeBiz.id}/promote`); await free.click("Buy online", "Featured placement — 30 days");
t("checkout failure from Stripe: friendly error, order marked FAILED, nothing activated", (await free.text()).includes("Couldn't start checkout: No such price") && (await db.order.count({ where: { businessId: freeBiz.id, status: "FAILED" } })) === 1);
await db.product.update({ where: { key: "featured_30d" }, data: { stripePriceId: "price_e2e_feat" } });
await free.go(`/owner/business/${freeBiz.id}/promote`); await free.click("Request this", "Featured placement — 7 days");
t("'Request this' (no Stripe price): sales enquiry created + admin emailed; repeat request doesn't duplicate", (await db.salesEnquiry.count({ where: { email: "fred@e2ecom.example", businessId: freeBiz.id } })) === 1 && (await db.emailOutbox.count({ where: { to: ADMIN_EMAIL, subject: { contains: "Product request" } } })) === 1);

// webhook security
t("webhook: GET not allowed", (await fetch(`${BASE}/api/stripe/webhook`)).status === 405);
const completed = { id: ord.stripeSessionId, payment_status: "paid", customer: "cus_e2e_1", subscription: "sub_e2e_1", metadata: { order_id: ord.id } };
t("webhook: no signature header → 400", (await webhook("checkout.session.completed", completed, { noSig: true })).status === 400);
t("webhook: bad signature / wrong secret → 400", (await webhook("checkout.session.completed", completed, { sig: "t=1,v1=deadbeef" })).status === 400 && (await webhook("checkout.session.completed", completed, { secret: "whsec_other" })).status === 400);
t("webhook: stale (replayed) timestamp → 400", (await webhook("checkout.session.completed", completed, { t: Math.floor(Date.now() / 1000) - 600 })).status === 400);
const badJson = "{not json"; t("webhook: valid signature over invalid JSON → 400; malformed event → 400", (await webhook("", {}, { raw: badJson })).status === 400 && (await webhook("", {}, { raw: JSON.stringify({ foo: 1 }) })).status === 400);
t("webhook: all of those changed nothing", (await db.order.findUnique({ where: { id: ord.id } })).status === "PENDING" && !(await db.subscription.count({ where: { businessId: freeBiz.id } })));
const w1 = await webhook("checkout.session.completed", completed);
t("webhook: valid signed event → 200, premium activated", w1.status === 200 && w1.body.result === "premium activated" && (await db.order.findUnique({ where: { id: ord.id } })).status === "PAID");
t("webhook: same event delivered again → 200 'duplicate', still ONE subscription", (await webhook("checkout.session.completed", completed, { id: w1.id })).body.result === "duplicate" && (await db.subscription.count({ where: { businessId: freeBiz.id } })) === 1);
await free.go("/businesses/london/cafes/e2e-com-free");
t("buying unlocks the premium features on the profile (enquiry form)", await free.page.evaluate(() => !!document.querySelector('[data-premium="enquiry"]')));
await free.go(`/owner/business/${freeBiz.id}/promote`);
t("owner page: Premium with 'Manage billing' (Stripe plan)", (await free.text()).includes("Premium") && (await free.text()).includes("Manage billing / cancel"));
const reqs2 = []; await free.page.setRequestInterception(true); free.page.on("request", (rq) => { if (/stripe\.test/.test(rq.url())) { reqs2.push(rq.url()); rq.abort().catch(() => {}); } });
await free.click("Manage billing / cancel");
t("billing portal: session created for the customer and the browser is sent to it", stripeCalls.some((c) => c.path === "/billing_portal/sessions" && c.params.customer === "cus_e2e_1") && reqs2.includes("https://billing.stripe.test/p/xyz"));
await free.page.setRequestInterception(false);
await webhook("invoice.payment_failed", { subscription: "sub_e2e_1" });
await free.go(`/owner/business/${freeBiz.id}/promote`);
t("payment failed → 'payment overdue' but features keep working during the grace period", (await free.text()).includes("payment overdue") && (await getPremium(freeBiz.id)));
async function getPremium(id) { await free.go("/businesses/london/cafes/e2e-com-free"); return free.page.evaluate(() => !!document.querySelector('[data-premium="enquiry"]')); }
await webhook("invoice.paid", { subscription: "sub_e2e_1", lines: { data: [{ period: { end: Math.floor((Date.now() + 33 * DAY) / 1000) } }] } });
t("invoice.paid restores ACTIVE and sets the paid-through date", (await db.subscription.findUnique({ where: { stripeSubscriptionId: "sub_e2e_1" } })).status === "ACTIVE" && (await db.subscription.findUnique({ where: { stripeSubscriptionId: "sub_e2e_1" } })).currentPeriodEnd.getTime() > Date.now() + 30 * DAY);
await webhook("customer.subscription.deleted", { id: "sub_e2e_1" });
t("subscription.deleted → Free again, features hidden", !(await getPremium(freeBiz.id)));
// featured purchase via webhook
await free.go(`/owner/business/${freeBiz.id}/promote`); await free.click("Buy online", "Featured placement — 30 days");
const fOrd = await db.order.findFirst({ where: { businessId: freeBiz.id, productKey: "featured_30d", status: "PENDING" } });
const fw = await webhook("checkout.session.completed", { id: fOrd.stripeSessionId, payment_status: "paid", metadata: { order_id: fOrd.id } });
const autoCamp = await db.campaign.findFirst({ where: { orderId: fOrd.id } });
t("online featured purchase → campaign created automatically (30 days, own category/area)", fw.body.result === "featured campaign created" && !!autoCamp && autoCamp.source === "ORDER" && autoCamp.categoryId === cf.id && Math.abs(autoCamp.endsAt.getTime() - (Date.now() + 30 * DAY)) < 120000);
await pub.go("/locations/hackney/cafes");
t("…and it appears, labelled, on its area × category page", await pub.page.evaluate(() => { const a = document.querySelector('[data-sponsored="featured"]'); return !!a && a.innerText.includes("E2E Com Free"); }));
await admin.go("/admin/commerce");
t("admin overview: paid online sales and campaign counts are non-zero; sample businesses were never charged", /Online sales \(\d+\)/.test(await admin.text()) && !(await admin.text()).includes("Online sales (0)"));

// ============================================================ I. integrity regression
await db.review.create({ data: { businessId: alpha.id, authorName: "Real Reviewer", authorEmail: "rr@e2ecom.example", authorEmailHash: sha("rr-e2ecom"), rating: 2, title: "Not great", body: "The service was late and the result was disappointing overall.", status: "PUBLISHED", bodyHash: "e2ecom1" } });
await db.business.update({ where: { id: alpha.id }, data: { ratingAvg: 2, ratingCount: 1 } });
await pub.go("/businesses/london/cleaning/e2e-com-alpha");
t("INTEGRITY: a premium business can't hide or improve a bad review/rating", (await pub.text()).includes("Not great") && (await pub.text()).includes("2.0") && (await db.business.findUnique({ where: { id: alpha.id } })).ratingAvg === 2);
await owner.go(`/owner/business/${alpha.id}/reviews`);
t("INTEGRITY: premium owners still can't edit or delete reviews (only reply/report)", (await owner.text()).includes("can't edit or delete reviews") && !/>\s*delete\s*</i.test(await owner.page.content()));
t("sitemap includes /advertise; premium/gallery data never added to JSON-LD claims", (await (async () => { const idx = await (await fetch(BASE + "/sitemap.xml")).text(); let all = ""; for (const m of idx.matchAll(/<loc>([^<]+)<\/loc>/g)) all += await (await fetch(BASE + new URL(m[1]).pathname)).text(); return all.includes("/advertise"); })()));

await wipe(); mock.close(); await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL COMMERCE E2E PASSED"); process.exit(fail ? 1 : 0);
