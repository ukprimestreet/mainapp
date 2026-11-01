/**
 * End-to-end: a business changes where it works, and the next customer's job follows it.
 *
 *   npm run start:e2e      (MAIL_DOMAIN= MAIL_FROM= next start -p 3418)
 *   node scripts/e2e-coverage.mjs
 *
 * The point of doing this in a browser rather than in a unit test: the whole value of the page is that a
 * business can widen its coverage **and the very next job request reaches it**, with no deploy and nothing
 * for us to re-run. So the customer side of that is driven through the real form, and the assertion is on
 * the assignment that results.
 *
 * It also checks the thing a unit test cannot: that owning one business does not let somebody edit another's
 * coverage by changing a hidden field.
 */
import puppeteer from "puppeteer-core";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3418";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const db = new PrismaClient();
let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const sha = (x) => createHash("sha256").update(x).digest("hex");

const MARK = "e2ecov";
const SLUG = "e2e-cov-";
const MINE = `mine@${MARK}.example`;
const THEIRS = `theirs@${MARK}.example`;
const CUSTOMER = `customer@${MARK}.example`;

async function cleanup() {
  const jobs = await db.jobRequest.findMany({ where: { email: { contains: MARK } }, select: { id: true } });
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
    await db.businessOwner.deleteMany({ where: { businessId: { in: bids } } });
    await db.auditLog.deleteMany({ where: { targetType: "Business", targetId: { in: bids } } });
    await db.business.deleteMany({ where: { id: { in: bids } } });
  }
  for (const email of [MINE, THEIRS]) {
    const o = await db.owner.findUnique({ where: { email }, select: { id: true } });
    if (o) {
      await db.ownerLoginToken.deleteMany({ where: { ownerId: o.id } });
      await db.owner.delete({ where: { id: o.id } });
    }
  }
}

const text = (page) => page.evaluate(() => document.body.innerText);
const MIN_FILL_MS = 4200;

/** Clicks and waits for the URL to actually change, rather than for a marker that may already be there. */
async function act(page, click) {
  const before = page.url();
  await click();
  await page.waitForFunction((was) => location.href !== was, { timeout: 30000 }, before);
  await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
}

async function signIn(page, ownerId) {
  const raw = randomBytes(18).toString("base64url");
  await db.ownerLoginToken.create({ data: { ownerId, tokenHash: sha(raw), expiresAt: new Date(Date.now() + 600000) } });
  await page.goto(`${BASE}/owner/login/${raw}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Sign in").click());
  await page.waitForFunction(() => location.pathname === "/owner", { timeout: 20000 });
}

/** A customer asks for work, through the real form. Returns the job row. */
async function customerAsks(page, { trade, borough, locality, email, description }) {
  await page.goto(`${BASE}/get-quotes`, { waitUntil: "networkidle0" });
  const began = Date.now(); // after the page is served: the four-second floor is measured from its token
  await page.select("#categoryId", trade);
  await page.select("#borough", borough);
  await page.select("#placeId", locality);
  await page.waitForFunction(() => !/Checking who covers/.test(document.body.innerText), { timeout: 20000 });
  const supply = await text(page);
  // D7 removed the "Send it anyway" wall: the form is open whether or not anybody covers the area.
  await page.type("#description", description);
  await page.type("#name", "Casey Tester");
  await page.type("#phone", "020 7946 0144");
  await page.type("#email", email);
  await page.evaluate(() => document.querySelector('input[name="consent"]').click());
  if (Date.now() - began < MIN_FILL_MS) await new Promise((r) => setTimeout(r, MIN_FILL_MS - (Date.now() - began)));
  await page.click('button::-p-text(Send my request)');
  await page.waitForFunction(() => location.pathname === "/get-quotes/sent", { timeout: 30000 })
    .catch(async () => { throw new Error("did not reach /get-quotes/sent :: " + (await text(page)).slice(0, 300)); });
  return db.jobRequest.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });

try {
  await cleanup();

  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } });
  const [here, nextDoor] = await db.place.findMany({
    where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, take: 2, orderBy: { name: "asc" },
  });
  const trade = await db.category.findFirst({ where: { slug: "plumbing" } });
  const any = await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } });

  const mine = await db.owner.create({ data: { email: MINE, name: "Mine Owner" } });
  const theirs = await db.owner.create({ data: { email: THEIRS, name: "Theirs Owner" } });

  const make = async (n, ownerId, placeId) => {
    const b = await db.business.create({
      data: {
        name: `E2E Coverage Trader ${n}`, slug: `${SLUG}${n}`,
        summary: "A fixture, created and removed by scripts/e2e-coverage.mjs.",
        description: "A fixture, created and removed by scripts/e2e-coverage.mjs.",
        categoryId: trade.id, locationId: any.locationId, cityId: any.cityId, published: true, isSample: false,
      },
    });
    await db.businessCategory.create({ data: { businessId: b.id, categoryId: trade.id, isPrimary: true } });
    await db.businessServiceArea.create({ data: { businessId: b.id, placeId, mode: "EXACT" } });
    await db.creditAccount.create({ data: { businessId: b.id, balance: 5 } });
    await db.businessOwner.create({ data: { ownerId, businessId: b.id } });
    return b;
  };
  // Mine covers one locality only. Theirs exists purely to be tampered with.
  const bizMine = await make(1, mine.id, here.id);
  const bizTheirs = await make(2, theirs.id, here.id);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // ================================================================ a job next door misses them
  const missed = await customerAsks(page, {
    trade: trade.id, borough: borough.id, locality: nextDoor.id, email: `customer-1@${MARK}.example`,
    description: "The shower pump has stopped and there is water under the floorboards upstairs.",
  });
  t("a job outside their one area does not reach them",
    (await db.leadAssignment.count({ where: { jobRequestId: missed.id, businessId: bizMine.id } })) === 0);

  // ================================================================ the owner widens their coverage
  await signIn(page, mine.id);
  await page.goto(`${BASE}/owner/business/${bizMine.id}/areas`, { waitUntil: "domcontentloaded" });
  const pageText = await text(page);
  t("the coverage page opens", /where you work/i.test(pageText));
  t("…and says plainly what it decides", /decides which job requests reach you/i.test(pageText));
  t("…shows what they currently cover", /Currently covering 1 area/.test(pageText), pageText.slice(0, 400));
  t("…and counts real demand in their areas", /Requests in your areas/.test(pageText));

  const ticked = await page.$$eval('input[name="areaIds"]:checked', (els) => els.map((e) => e.value));
  t("their existing area is ticked, not reset to nothing", ticked.length === 1 && ticked[0] === here.id);
  const nearbyTicked = await page.$eval('input[name="acceptsNearby"]', (e) => e.checked);
  t("nearby work is off, because nobody asked for it", nearbyTicked === false);

  // Tick the whole borough and turn on nearby work.
  await page.evaluate((bid) => {
    document.querySelector(`input[name="areaIds"][value="${bid}"]`).click();
    document.querySelector('input[name="acceptsNearby"]').click();
  }, borough.id);
  await act(page, () => page.click('button::-p-text(Save what I cover)'));

  const saved = await text(page);
  t("saving reports what they now cover", /You now cover 2 areas/.test(saved), saved.slice(0, 300));
  t("…and that it takes effect immediately", /straight away/i.test(saved));
  const areas = await db.businessServiceArea.findMany({ where: { businessId: bizMine.id } });
  t("the borough is stored as covering everything in it", areas.some((a) => a.placeId === borough.id && a.mode === "INCLUDES_CHILDREN"));
  t("…the locality stays as itself", areas.some((a) => a.placeId === here.id && a.mode === "EXACT"));
  t("…and nearby work is on", (await db.business.findUnique({ where: { id: bizMine.id } })).acceptsNearby === true);
  t("the change is audited", !!(await db.auditLog.findFirst({ where: { targetType: "Business", targetId: bizMine.id, action: { contains: "Service areas" } } })));
  t("…and in the business's own edit log, which the owner can see", !!(await db.businessEditLog.findFirst({ where: { businessId: bizMine.id } })));

  // ================================================================ the next job follows it
  const reached = await customerAsks(page, {
    trade: trade.id, borough: borough.id, locality: nextDoor.id, email: `customer-2@${MARK}.example`,
    description: "Same again: the shower pump has failed and it is leaking through the ceiling below.",
  });
  t("the very next job in the new area DOES reach them, with no deploy",
    (await db.leadAssignment.count({ where: { jobRequestId: reached.id, businessId: bizMine.id, status: { not: "REVERSED" } } })) === 1);
  t("…and a credit was charged for it", (await db.creditAccount.findUnique({ where: { businessId: bizMine.id } })).balance === 4);

  // ================================================================ they cannot make themselves unreachable by accident
  await page.goto(`${BASE}/owner/business/${bizMine.id}/areas`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.querySelectorAll('input[name="areaIds"]:checked').forEach((e) => e.click()));
  await act(page, () => page.click('button::-p-text(Save what I cover)'));
  const refused = await text(page);
  t("unticking every area is refused", /at least one area/i.test(refused), refused.slice(0, 300));
  t("…and their coverage is untouched", (await db.businessServiceArea.count({ where: { businessId: bizMine.id } })) === 2);

  await page.goto(`${BASE}/owner/business/${bizMine.id}/areas`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.querySelectorAll('input[name="categoryIds"]:checked').forEach((e) => e.click()));
  await act(page, () => page.click('button::-p-text(Save what I cover)'));
  t("unticking every trade is refused too", /at least one kind of work/i.test(await text(page)));
  t("…and their trades are untouched", (await db.businessCategory.count({ where: { businessId: bizMine.id } })) === 1);

  // ================================================================ one owner cannot edit another's coverage
  const theirsBefore = await db.businessServiceArea.count({ where: { businessId: bizTheirs.id } });
  await page.goto(`${BASE}/owner/business/${bizMine.id}/areas`, { waitUntil: "domcontentloaded" });
  await page.evaluate((other) => { document.querySelector('input[name="businessId"]').value = other; }, bizTheirs.id);
  await page.click('button::-p-text(Save what I cover)').catch(() => {});
  await page.waitForNetworkIdle({ idleTime: 800 }).catch(() => {});
  t("editing the hidden business id does not let them change somebody else's coverage",
    (await db.businessServiceArea.count({ where: { businessId: bizTheirs.id } })) === theirsBefore);
  t("…and the other business is still where it was", (await db.businessServiceArea.findFirst({ where: { businessId: bizTheirs.id } })).placeId === here.id);
  t("…with nothing logged against it", (await db.businessEditLog.count({ where: { businessId: bizTheirs.id } })) === 0);

  await page.close();
} finally {
  await browser.close();
  await cleanup();
  await db.$disconnect();
}

console.log(fail === 0 ? "\nALL COVERAGE E2E CHECKS PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
