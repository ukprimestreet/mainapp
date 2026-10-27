/**
 * End-to-end: a customer asks, two businesses are charged, and both of them can see the job.
 *
 *   npm run start:e2e      (MAIL_DOMAIN= MAIL_FROM= next start -p 3418)
 *   node scripts/e2e-matching.mjs
 *
 * This is the money path, so it is checked in a real browser from all three sides: the customer sees who has
 * their job, the administrator sees why each decision was made, and the business sees the customer's phone
 * number it has just paid a credit for. A charge the business cannot act on would be the worst outcome in
 * the whole system, which is why "the owner can read the number" is an assertion here and not an assumption.
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3418";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const env = readFileSync(".env", "utf8");
const ADMIN_EMAIL = env.match(/ADMIN_EMAIL="(.*)"/)[1];
const ADMIN_PW = env.match(/ADMIN_PASSWORD="(.*)"/)[1];

const db = new PrismaClient();
let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const sha = (x) => createHash("sha256").update(x).digest("hex");

const MARK = "e2ematch";
const EMAIL = `customer@${MARK}.example`;
const SLUG = "e2e-match-";
const OWNER_EMAIL = `owner@${MARK}.example`;

async function cleanup() {
  const jobs = await db.jobRequest.findMany({ where: { email: { contains: MARK } }, select: { id: true, reference: true } });
  const ids = jobs.map((j) => j.id);
  for (const j of jobs) await db.emailOutbox.deleteMany({ where: { subject: { contains: j.reference } } });
  await db.emailOutbox.deleteMany({ where: { to: { contains: MARK } } });
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
    await db.businessOwner.deleteMany({ where: { businessId: { in: bids } } });
    await db.auditLog.deleteMany({ where: { targetType: "Business", targetId: { in: bids } } });
    await db.business.deleteMany({ where: { id: { in: bids } } });
  }
  const owner = await db.owner.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (owner) {
    await db.ownerLoginToken.deleteMany({ where: { ownerId: owner.id } });
    await db.owner.delete({ where: { id: owner.id } });
  }
}

const MIN_FILL_MS = 4200;
const text = (page) => page.evaluate(() => document.body.innerText);

/**
 * Clicks something and waits for the URL to actually CHANGE.
 *
 * Waiting for `msg=` to appear is wrong once it is already there from the previous action: the condition is
 * true immediately, the assertions read the database before the server has done anything, and the suite
 * reports a failure that is really a race in the test. That is exactly what happened here first time.
 */
async function act(page, click) {
  const before = page.url();
  await click();
  await page.waitForFunction((was) => location.href !== was, { timeout: 30000 }, before);
  await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });

try {
  await cleanup();

  // ---------------------------------------------------------------- two suppliers, both able to pay
  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } });
  const locality = await db.place.findFirst({ where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, orderBy: { name: "asc" } });
  const trade = await db.category.findFirst({ where: { slug: "plumbing" } });
  const any = await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } });
  const owner = await db.owner.create({ data: { email: OWNER_EMAIL, name: "Omar Match" } });

  const traders = [];
  for (const n of [1, 2, 3]) {
    const b = await db.business.create({
      data: {
        name: `E2E Match Trader ${n}`, slug: `${SLUG}${n}`,
        summary: "A fixture, created and removed by scripts/e2e-matching.mjs.",
        description: "A fixture, created and removed by scripts/e2e-matching.mjs.",
        categoryId: trade.id, locationId: any.locationId, cityId: any.cityId, published: true, isSample: false,
      },
    });
    await db.businessCategory.create({ data: { businessId: b.id, categoryId: trade.id, isPrimary: true } });
    await db.businessServiceArea.create({ data: { businessId: b.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });
    // Three willing businesses, so the two-place limit has something to actually limit.
    await db.creditAccount.create({ data: { businessId: b.id, balance: 3 } });
    await db.businessOwner.create({ data: { ownerId: owner.id, businessId: b.id } });
    traders.push(b);
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // ================================================================ the customer
  await page.goto(`${BASE}/get-quotes`, { waitUntil: "networkidle0" });
  // The clock starts when the FORM was rendered, not when we started navigating: the four-second floor is
  // measured from the token the page was served with, so timing the page load into it reads as "too fast".
  const began = Date.now();
  await page.select("#categoryId", trade.id);
  await page.select("#borough", borough.id);
  await page.select("#placeId", locality.id);
  await page.waitForFunction(() => !/Checking who covers/.test(document.body.innerText), { timeout: 20000 });
  t("the form finds all three businesses", /3 businesses/.test(await text(page)), (await text(page)).slice(0, 240));
  t("…and still promises a maximum of two", /maximum of 2/.test(await text(page)));

  await page.type("#description", "The boiler is making a knocking noise and the radiators upstairs are cold.");
  await page.type("#name", "Casey Tester");
  await page.type("#phone", "020 7946 0177");
  await page.type("#email", EMAIL);
  await page.evaluate(() => document.querySelector('input[name="consent"]').click());
  if (Date.now() - began < MIN_FILL_MS) await new Promise((r) => setTimeout(r, MIN_FILL_MS - (Date.now() - began)));
  await page.click('button::-p-text(Send my request)');
  await page.waitForFunction(() => location.pathname === "/get-quotes/sent", { timeout: 30000 })
    .catch(async () => { throw new Error("did not reach /get-quotes/sent :: " + (await text(page)).slice(0, 400)); });

  const sent = await text(page);
  const reference = sent.match(/PS-[A-Z0-9]{5}/)?.[0];
  const job = await db.jobRequest.findFirst({ where: { email: EMAIL } });
  const live = await db.leadAssignment.findMany({ where: { jobRequestId: job.id }, include: { business: true } });

  t("exactly two businesses were assigned", live.length === 2, `${live.length}`);
  t("…the job reads as ASSIGNED", job.status === "ASSIGNED", job.status);
  t("…two credits were charged, one each", live.every((a) => a.creditCharged) &&
    (await db.creditTransaction.count({ where: { kind: "CONSUMPTION", assignmentId: { in: live.map((a) => a.id) } } })) === 2);
  t("…each holds a distinct paid place", new Set(live.map((a) => a.paidSlot)).size === 2);
  t("…and the third business was not charged", (await db.creditAccount.findMany({ where: { businessId: { in: traders.map((x) => x.id) } } })).filter((c) => c.balance === 3).length === 1);

  t("the customer is told WHO has their job, by name", live.every((a) => sent.includes(a.business.name)), sent.slice(0, 300));
  t("…and that nobody else will get their details", /nobody else will be given your details/i.test(sent));

  // ---- and both were told, by email, without anybody opening a dashboard
  const notifications = await db.emailOutbox.findMany({ where: { subject: { contains: job.reference } } });
  t("both businesses were emailed about the job", notifications.length >= 2, `${notifications.length}`);
  t("…from the enquiries address", notifications.every((m) => m.purpose === "enquiries"));
  t("…with the customer's phone number in the email, not behind a link", notifications.every((m) => m.body.includes("020 7946 0177")));
  t("…and it was recorded against the assignment", (await db.leadAssignment.findMany({ where: { jobRequestId: job.id } })).every((a) => !!a.notifiedAt));
  t("…but not actually sent, because mail is off for this suite", notifications.every((m) => m.sentAt === null),
    "restart the server with MAIL_DOMAIN unset");

  // ================================================================ the administrator
  // `domcontentloaded` rather than `networkidle0`: arriving from the confirmation page, something kept a
  // socket open long enough for "no network activity" never to be true, and the suite hung on a server that
  // was answering in 150ms. The assertion only needs the form to exist.
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#email", { timeout: 20000 });
  await page.type("#email", ADMIN_EMAIL);
  await page.type("#password", ADMIN_PW);
  await page.click("form button:not([type=button])");
  await page.waitForFunction(() => location.pathname === "/admin", { timeout: 20000 });

  await page.goto(`${BASE}/admin/leads/${job.id}`, { waitUntil: "domcontentloaded" });
  const detail = await text(page);
  t("the lead detail page opens", detail.includes(reference));
  t("…showing both paid places filled", /2 of 2/.test(detail), detail.slice(0, 400));
  t("…naming both businesses that have it", live.every((a) => detail.includes(a.business.name)));
  t("…and that a credit was charged for each", (detail.match(/1 charged/g) ?? []).length === 2);
  t("every decision is on the page, with a reason", /Every decision/.test(detail) && /assigned/i.test(detail));
  t("…including why the third business did not get it", detail.includes(traders.find((x) => !live.some((a) => a.businessId === x.id)).name));
  t("the customer's phone is not shown until it is asked for", !/7946 0177/.test(detail));

  // ---- taking one back refunds the credit
  const first = live[0];
  const beforeReverse = (await db.creditAccount.findUnique({ where: { businessId: first.businessId } })).balance;
  await page.type(`#rev-${first.id}`, "The customer rang to say they had already booked somebody");
  await act(page, () => page.evaluate((id) => document.querySelector(`#rev-${id}`).form.querySelector("button").click(), first.id));
  const afterReverse = await db.leadAssignment.findUnique({ where: { id: first.id } });
  t("an assignment can be taken back from the page", afterReverse.status === "REVERSED");
  t("…the credit is refunded", (await db.creditAccount.findUnique({ where: { businessId: first.businessId } })).balance === beforeReverse + 1);
  t("…with a REVERSAL row rather than a silent edit", !!(await db.creditTransaction.findFirst({ where: { assignmentId: first.id, kind: "REVERSAL" } })));
  t("…its paid place is freed", afterReverse.paidSlot === null);
  t("…and the reason is shown on the page", /already booked somebody/i.test(await text(page)));

  // ---- and matching can fill the freed place
  await act(page, () => page.click('button::-p-text(Run matching again)'));
  const refilled = await db.leadAssignment.findMany({ where: { jobRequestId: job.id, status: { not: "REVERSED" }, paidSlot: { not: null } } });
  t("re-running fills the freed place with the third business", refilled.length === 2, `${refilled.length}`);
  t("…and the job is ASSIGNED again", (await db.jobRequest.findUnique({ where: { id: job.id } })).status === "ASSIGNED");
  t("…with no business holding it twice", new Set(refilled.map((r) => r.businessId)).size === refilled.length);

  // ---- a sponsored assignment takes no place and charges nothing
  //
  // The target is read from the database rather than assumed. Now that a reversed assignment is history
  // instead of a ban, the re-run above may legitimately have given the job back to the business we took it
  // from — and a business that already holds it is not offered in the dropdown, so assuming otherwise left
  // the form unsubmittable and the suite hanging. Pick whoever is actually free.
  const liveNow = await db.leadAssignment.findMany({ where: { jobRequestId: job.id, status: { not: "REVERSED" } }, select: { businessId: true } });
  const sponsorTarget = traders.find((x) => !liveNow.some((a) => a.businessId === x.id));
  t("one business is still free to be sponsored", !!sponsorTarget, `live: ${liveNow.length}`);
  await page.select("#businessId", sponsorTarget.id);
  await page.select("#kind", "SPONSORED");
  await page.type("#reason", "Goodwill after we took the last one back");
  await act(page, () => page.click('button::-p-text(Assign)'));
  const sponsored = await db.leadAssignment.findFirst({ where: { jobRequestId: job.id, businessId: sponsorTarget.id, kind: "SPONSORED" } });
  t("a sponsored assignment can be made by hand", !!sponsored);
  t("…taking no paid place", sponsored?.paidSlot === null);
  t("…charging nothing", !sponsored?.creditCharged);
  t("…and the reason is recorded against it", /goodwill/i.test(sponsored?.reason ?? ""));

  // ================================================================ the business
  const assignment = (await db.leadAssignment.findFirst({ where: { jobRequestId: job.id, status: "PENDING", creditCharged: true }, include: { business: true } }));
  const raw = randomBytes(18).toString("base64url");
  await db.ownerLoginToken.create({ data: { ownerId: owner.id, tokenHash: sha(raw), expiresAt: new Date(Date.now() + 600000) } });
  await page.goto(`${BASE}/owner/login/${raw}`, { waitUntil: "networkidle0" });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Sign in").click());
  await page.waitForFunction(() => location.pathname === "/owner", { timeout: 20000 });

  await page.goto(`${BASE}/owner/business/${assignment.businessId}/leads`, { waitUntil: "networkidle0" });
  const ownerView = await text(page);
  t("the business sees the job it paid for", ownerView.includes(job.reference), ownerView.slice(0, 300));
  t("…with the customer's phone number, which is what the credit bought", /7946 0177/.test(ownerView));
  t("…their name and email", ownerView.includes("Casey Tester") && ownerView.includes(EMAIL));
  t("…what the job is", /boiler/i.test(ownerView));
  t("…and how many credits are left", /lead credit/i.test(ownerView));
  t("opening it is recorded as seen, so silence is a fact and not a guess",
    (await db.leadAssignment.findUnique({ where: { id: assignment.id } })).deliveredAt !== null);

  await page.goto(`${BASE}/admin/leads/${job.id}`, { waitUntil: "domcontentloaded" });
  t("…and the administrator can see that they opened it", /opened/i.test(await text(page)));

  await page.close();
} finally {
  await browser.close();
  await cleanup();
  await db.$disconnect();
}

console.log(fail === 0 ? "\nALL MATCHING E2E CHECKS PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
