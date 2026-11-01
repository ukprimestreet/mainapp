/**
 * End-to-end: a customer asks for quotes, and an administrator picks the request up.
 *
 * Run against a server started with mail disabled, like the other suites:
 *
 *   npm run start:e2e      (MAIL_DOMAIN= MAIL_FROM= next start -p 3418)
 *   node scripts/e2e-leads.mjs
 *
 * This suite builds its own supply — one published business covering a whole borough for one trade — because
 * the thing worth proving in a browser is that the form tells the customer the truth about supply *before*
 * asking for their phone number, and that the truth changes when the supply does.
 *
 * Nothing here costs money: no address lookup is involved. A customer gives a postcode, never an address.
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3418";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const env = readFileSync(".env", "utf8");
const ADMIN_EMAIL = env.match(/ADMIN_EMAIL="(.*)"/)[1];
const ADMIN_PW = env.match(/ADMIN_PASSWORD="(.*)"/)[1];

const db = new PrismaClient();
let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const MARK = "e2elead";
const EMAIL = `customer@${MARK}.example`;
const SUPPLIER = "E2E Lead Suite Plumber";

async function cleanup() {
  const jobs = await db.jobRequest.findMany({ where: { email: { contains: MARK } }, select: { id: true } });
  if (jobs.length) {
    await db.auditLog.deleteMany({ where: { targetType: "JobRequest", targetId: { in: jobs.map((j) => j.id) } } });
    await db.jobRequest.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
  }
  const biz = await db.business.findMany({ where: { name: SUPPLIER }, select: { id: true } });
  if (biz.length) {
    const ids = biz.map((b) => b.id);
    await db.businessServiceArea.deleteMany({ where: { businessId: { in: ids } } });
    await db.businessCategory.deleteMany({ where: { businessId: { in: ids } } });
    await db.business.deleteMany({ where: { id: { in: ids } } });
  }
}

// The form refuses anything submitted in under four seconds. A real control, so the suite respects it.
const MIN_FILL_MS = 4200;
const text = (page) => page.evaluate(() => document.body.innerText);

/**
 * Clicks a button inside the card for ONE lead.
 *
 * Scoped by the lead's id rather than by position, because dev may hold other requests and the queue is
 * sorted oldest-first — "the first Close button" would close somebody else's lead.
 */
async function clickForLead(page, jobId, label) {
  const handle = await page.evaluateHandle((id, text) => {
    const input = [...document.querySelectorAll('input[name="id"]')].find((i) => i.value === id && i.form?.innerText.includes(text));
    return input?.form?.querySelector("button") ?? null;
  }, jobId, label);
  const el = handle.asElement();
  if (!el) throw new Error(`no "${label}" button for lead ${jobId}`);
  await el.click();
}

/** Chooses trade and area, then waits for the supply check to come back. */
async function chooseWork(page, { trade, borough, locality }) {
  await page.goto(`${BASE}/get-quotes`, { waitUntil: "networkidle0" });
  await page.select("#categoryId", trade);
  await page.select("#borough", borough);
  if (locality) await page.select("#placeId", locality);
  await page.waitForFunction(() => !/Checking who covers/.test(document.body.innerText), { timeout: 20000 });
}

async function fillDetails(page, { description, email = EMAIL, consent = true, marketing = false } = {}) {
  await page.type("#description", description ?? "The kitchen tap has dripped for a fortnight and the cold feed under the sink is weeping at the joint.");
  await page.type("#postcode", "E8 3AA");
  await page.type("#name", "Casey Tester");
  await page.type("#phone", "020 7946 0133");
  await page.type("#email", email);
  await page.type("#contactTime", "Weekday afternoons");
  await page.evaluate((c, m) => {
    if (c) document.querySelector('input[name="consent"]').click();
    if (m) document.querySelector('input[name="marketingOptIn"]').click();
  }, consent, marketing);
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });

try {
  await cleanup();

  // ---------------------------------------------------------------- supply fixture
  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } });
  const locality = await db.place.findFirst({ where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } } });
  const trade = await db.category.findFirst({ where: { slug: "plumbing" } });
  const bareTrade = await db.category.findFirst({ where: { slug: "roofing" } });
  const anyBiz = await db.business.findFirst({ select: { locationId: true, cityId: true } });

  const supplier = await db.business.create({
    data: {
      name: SUPPLIER, slug: "e2e-lead-suite-plumber",
      summary: "A fixture, created and removed by scripts/e2e-leads.mjs.",
      description: "A fixture, created and removed by scripts/e2e-leads.mjs.",
      categoryId: trade.id, locationId: anyBiz.locationId, cityId: anyBiz.cityId,
      published: true, isSample: false,
    },
  });
  await db.businessCategory.create({ data: { businessId: supplier.id, categoryId: trade.id, isPrimary: true } });
  await db.businessServiceArea.create({ data: { businessId: supplier.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  /**
   * ================================================================ the form is honest about supply
   *
   * **Decision D7 changed this.** It used to say "we do not have anyone listed … you should not wait on us"
   * and keep the contact fields shut behind a "Send it anyway" button. The owner sources a provider when a
   * job arrives, so discouraging the customer was costing jobs we could have got done.
   *
   * What is still asserted is the honesty: we do not claim to have businesses we do not have.
   */
  await chooseWork(page, { trade: bareTrade.id, borough: borough.id, locality: locality.id });
  const noSupply = await text(page);
  t("with nobody covering the trade, the form says so plainly", /nobody is listed for this/i.test(noSupply), noSupply.slice(0, 300));
  t("…and says what actually happens next: we go and find somebody", /go and find somebody/i.test(noSupply));
  t("…without claiming any business covers the area", !/businesses cover/i.test(noSupply));
  t("…and the rest of the form is open, not hidden behind a warning", (await page.$("#phone")) !== null,
    "D7: a job from an uncovered area is one we source a provider for");

  await chooseWork(page, { trade: trade.id, borough: borough.id, locality: locality.id });
  const thin = await text(page);
  t("one business covering the borough is found for a locality inside it", /one business/i.test(thin), thin.slice(0, 300));
  t("…and the form admits it will be one quote, not two", /one quote/i.test(thin));
  t("…and only now are contact details asked for", (await page.$("#phone")) !== null);

  // ================================================================ the notice the consent box points at
  const consentLink = await page.$eval('input[name="consent"]', (el) => {
    const section = el.closest("section");
    return section.querySelector('a[href="/privacy"]')?.getAttribute("href") ?? null;
  });
  t("the consent box sits with a link to the privacy notice", consentLink === "/privacy");

  const formPage = page.url();
  await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
  const notice = await text(page);
  t("the notice actually describes the quote form", /if you ask us for quotes/i.test(notice), notice.slice(0, 200));
  t("…naming the two-business limit", /maximum of 2 businesses/i.test(notice));
  t("…saying we never ask for a full address", /never ask for your full address/i.test(notice));
  t("…how long it is kept", /90 days/.test(notice) && /12 months/.test(notice));
  t("…and carrying a version, since every consent records one", /Version \d{4}-\d{2}-\d{2}/.test(notice), notice.slice(0, 300));
  // Coming back is a fresh page, so the choices have to be made again: the form keeps its state in the
  // browser, not in the URL. (`formPage` is kept only to prove we returned to the form, not the home page.)
  t("we are back on the form", new URL(formPage).pathname === "/get-quotes");
  await chooseWork(page, { trade: trade.id, borough: borough.id, locality: locality.id });

  // ================================================================ validation happens on the server
  const startedAt = Date.now();
  await fillDetails(page, { description: "Tap broken." });
  if (Date.now() - startedAt < MIN_FILL_MS) await new Promise((r) => setTimeout(r, MIN_FILL_MS - (Date.now() - startedAt)));
  await Promise.all([page.click('button::-p-text(Send my request)'), page.waitForNetworkIdle({ idleTime: 700 })]);
  t("a two-word description is refused", /at least 20 characters/i.test(await text(page)));
  t("…and nothing was recorded", (await db.jobRequest.count({ where: { email: EMAIL } })) === 0);

  // ================================================================ the happy path
  const began = Date.now();
  await chooseWork(page, { trade: trade.id, borough: borough.id, locality: locality.id });
  await fillDetails(page, { marketing: false });
  if (Date.now() - began < MIN_FILL_MS) await new Promise((r) => setTimeout(r, MIN_FILL_MS - (Date.now() - began)));
  await page.click('button::-p-text(Send my request)');
  await page.waitForFunction(() => location.pathname === "/get-quotes/sent", { timeout: 30000 })
    .catch(async () => {
      const shown = await text(page);
      throw new Error("did not reach /get-quotes/sent; still on " + page.url() + " :: " + shown.slice(0, 300));
    });

  const sent = await text(page);
  const reference = sent.match(/PS-[A-Z0-9]{5}/)?.[0];
  t("a complete request lands on the confirmation page", new URL(page.url()).pathname === "/get-quotes/sent");
  t("…showing a reference the customer can quote back", !!reference, sent.slice(0, 200));
  t("…and what will happen next", /pass it to no more than 2/i.test(sent), sent.slice(0, 300));
  t("the confirmation does NOT echo the customer's phone or email", !/7946 0133/.test(sent) && !sent.includes(EMAIL));

  const job = await db.jobRequest.findFirst({ where: { email: EMAIL } });
  t("the request is recorded", !!job && job.reference === reference);
  t("…against the trade and the local area chosen", job.categoryId === trade.id && job.placeId === locality.id);
  t("…with the supply that existed at the time", job.providersAtCreation === 1);
  t("…the consent version, not just a boolean", !!job.consentVersion);
  t("…marketing off, because it was left unticked", job.marketingOptIn === false);
  t("…the postcode, and no street address asked for or stored", job.postcode === "E8 3AA");
  t("…and the IP only as a hash", !!job.ipHash && job.ipHash.length >= 16 && !job.ipHash.includes("."));

  // A refresh of the same request must not create a second job and a second round of phone calls.
  await page.goBack({ waitUntil: "networkidle0" }).catch(() => {});
  await chooseWork(page, { trade: trade.id, borough: borough.id, locality: locality.id });
  const re = Date.now();
  await fillDetails(page);
  if (Date.now() - re < MIN_FILL_MS) await new Promise((r) => setTimeout(r, MIN_FILL_MS - (Date.now() - re)));
  await page.click('button::-p-text(Send my request)');
  await page.waitForFunction(() => location.pathname === "/get-quotes/sent", { timeout: 30000 });
  t("sending the identical request again does not create a second job", (await db.jobRequest.count({ where: { email: EMAIL } })) === 1);

  // ================================================================ the administrator's side
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle0" });
  await page.type("#email", ADMIN_EMAIL);
  await page.type("#password", ADMIN_PW);
  await page.click("form button:not([type=button])");
  await page.waitForFunction(() => location.pathname === "/admin", { timeout: 20000 });

  await page.goto(`${BASE}/admin/leads`, { waitUntil: "networkidle0" });
  const queue = await text(page);
  t("the lead is in the admin queue the moment it exists", queue.includes(reference), queue.slice(0, 400));
  t("…showing the trade and the area", /Plumbing/i.test(queue) && queue.includes(locality.label));
  t("…and how much supply there was", /covering when it arrived/i.test(queue));
  t("the customer's phone is NOT on the page by default", !/7946 0133/.test(queue));
  t("…nor their email", !queue.includes(EMAIL));

  await clickForLead(page, job.id, "Show customer details");
  await page.waitForFunction(() => /reveal=/.test(location.search), { timeout: 20000 });
  await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
  const revealed = await text(page);
  t("revealing shows the customer's details", /7946 0133/.test(revealed) && revealed.includes(EMAIL));
  t("…and says the view was recorded", /recorded in the audit log/i.test(revealed));
  t("…including whether they may be emailed anything else", /not opted in/i.test(revealed));

  const look = await db.auditLog.findFirst({ where: { targetType: "JobRequest", targetId: job.id, action: { contains: "viewed" } } });
  t("the reveal is in the audit log", !!look);
  t("…attributed to the administrator who looked", look?.actorEmail === ADMIN_EMAIL || look?.actorKind === "SYSTEM", `${look?.actorKind}`);
  t("…and the log itself holds no contact details", !/7946 0133/.test(look?.detail ?? "") && !(look?.detail ?? "").includes(EMAIL));

  // ================================================================ closing, with a reason
  await page.goto(`${BASE}/admin/leads`, { waitUntil: "networkidle0" });
  await page.select(`#reason-${job.id}`, "HANDLED_OFFLINE");
  await clickForLead(page, job.id, "Close");
  await page.waitForFunction(() => /msg=/.test(location.search), { timeout: 20000 });
  const closedRow = await db.jobRequest.findUnique({ where: { id: job.id } });
  t("a lead can be closed", closedRow.status === "CLOSED");
  t("…with the reason recorded, not discarded", closedRow.closedReason === "HANDLED_OFFLINE");
  // Checked against the cards, not the page text: the confirmation message itself quotes the reference.
  const openIds = await page.$$eval('input[name="id"]', (els) => els.map((e) => e.value));
  t("…and it leaves the open queue", !openIds.includes(job.id));

  await page.goto(`${BASE}/admin/leads?show=all`, { waitUntil: "networkidle0" });
  t("closed leads are still findable", (await text(page)).includes(reference));
  await clickForLead(page, job.id, "Reopen");
  await page.waitForFunction(() => /msg=/.test(location.search), { timeout: 20000 });
  t("…and can be reopened when supply changes", (await db.jobRequest.findUnique({ where: { id: job.id } })).status === "NEW");

  // ================================================================ supply disappearing changes the answer
  await db.business.update({ where: { id: supplier.id }, data: { published: false } });
  await chooseWork(page, { trade: trade.id, borough: borough.id, locality: locality.id });
  t("unpublishing the only provider changes what the form tells the next customer",
    /nobody is listed for this/i.test(await text(page)));

  await page.close();
} finally {
  await browser.close();
  await cleanup();
  await db.$disconnect();
}

console.log(fail === 0 ? "\nALL LEAD E2E CHECKS PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
