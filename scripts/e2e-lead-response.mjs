/**
 * End-to-end: a trade answers from the email, with no sign-in.
 *
 *   npm run start:e2e      (MAIL_DOMAIN= MAIL_FROM= next start -p 3418)
 *   node scripts/e2e-lead-response.mjs
 *
 * Two things here can only be checked in a browser, and both of them matter more than the happy path:
 *
 *   1. **A GET must change nothing.** Email clients and security scanners prefetch links. A GET that acted
 *      would have mail software declining people's jobs for them, refunding credits and reassigning work
 *      that nobody had decided to give up.
 *   2. **The link must work with no session at all**, because a sign-in wall is the reason nobody tells us
 *      anything. So the page is opened in a browser that has never signed in.
 */
import puppeteer from "puppeteer-core";
import { createHmac, createHash, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3418";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const env = readFileSync(".env", "utf8");
const SESSION_SECRET = env.match(/SESSION_SECRET="(.*)"/)?.[1];
if (!SESSION_SECRET) throw new Error("SESSION_SECRET is not in .env; the response links are signed with it");

const db = new PrismaClient();
let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const sha = (x) => createHash("sha256").update(x).digest("hex");

/** The same signature the server computes, so the suite proves the contract rather than reading it back. */
const token = (id) => createHmac("sha256", SESSION_SECRET).update(`lead-response:${id}`).digest("base64url");

const MARK = "e2eresponse";
const SLUG = "e2e-response-";
const OWNER = `owner@${MARK}.example`;

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
    await db.businessOwner.deleteMany({ where: { businessId: { in: bids } } });
    await db.auditLog.deleteMany({ where: { targetType: "Business", targetId: { in: bids } } });
    await db.business.deleteMany({ where: { id: { in: bids } } });
  }
  await db.emailOutbox.deleteMany({ where: { to: { contains: MARK } } });
  const o = await db.owner.findUnique({ where: { email: OWNER }, select: { id: true } });
  if (o) { await db.ownerLoginToken.deleteMany({ where: { ownerId: o.id } }); await db.owner.delete({ where: { id: o.id } }); }
}

const text = (page) => page.evaluate(() => document.body.innerText);
const MIN_FILL_MS = 4200;

async function act(page, click) {
  const before = page.url();
  await click();
  await page.waitForFunction((was) => location.href !== was, { timeout: 30000 }, before);
  await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });

try {
  await cleanup();

  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } });
  const locality = await db.place.findFirst({ where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, orderBy: { name: "asc" } });
  const trade = await db.category.findFirst({ where: { slug: "plumbing" } });
  const any = await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } });
  const owner = await db.owner.create({ data: { email: OWNER, name: "Ravi Response" } });

  const traders = [];
  for (const n of [1, 2]) {
    const b = await db.business.create({
      data: {
        name: `E2E Response Trader ${n}`, slug: `${SLUG}${n}`,
        summary: "A fixture, created and removed by scripts/e2e-lead-response.mjs.",
        description: "A fixture, created and removed by scripts/e2e-lead-response.mjs.",
        categoryId: trade.id, locationId: any.locationId, cityId: any.cityId, published: true, isSample: false,
      },
    });
    await db.businessCategory.create({ data: { businessId: b.id, categoryId: trade.id, isPrimary: true } });
    await db.businessServiceArea.create({ data: { businessId: b.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });
    await db.creditAccount.create({ data: { businessId: b.id, balance: 4 } });
    await db.businessOwner.create({ data: { ownerId: owner.id, businessId: b.id } });
    traders.push(b);
  }

  // ---- a customer asks, through the real form, so the assignments and emails are real
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/get-quotes`, { waitUntil: "networkidle0" });
  const began = Date.now();
  await page.select("#categoryId", trade.id);
  await page.select("#borough", borough.id);
  await page.select("#placeId", locality.id);
  await page.waitForFunction(() => !/Checking who covers/.test(document.body.innerText), { timeout: 20000 });
  await page.type("#description", "The downstairs toilet is blocked and the bathroom tap will not shut off properly.");
  await page.type("#name", "Casey Tester");
  await page.type("#phone", "020 7946 0166");
  await page.type("#email", `customer@${MARK}.example`);
  await page.evaluate(() => document.querySelector('input[name="consent"]').click());
  if (Date.now() - began < MIN_FILL_MS) await new Promise((r) => setTimeout(r, MIN_FILL_MS - (Date.now() - began)));
  await page.click('button::-p-text(Send my request)');
  await page.waitForFunction(() => location.pathname === "/get-quotes/sent", { timeout: 30000 });

  const job = await db.jobRequest.findFirst({ where: { email: `customer@${MARK}.example` } });
  const assignments = await db.leadAssignment.findMany({ where: { jobRequestId: job.id }, orderBy: { paidSlot: "asc" } });
  t("both businesses were assigned and charged", assignments.length === 2 && assignments.every((a) => a.creditCharged));

  const mail = await db.emailOutbox.findFirst({ where: { to: OWNER }, orderBy: { createdAt: "asc" } });
  const first = assignments[0], second = assignments[1];
  t("the lead email contains the one-click link for that assignment", (mail?.body ?? "").includes(`/lead/${first.id}/`) || (mail?.body ?? "").includes(`/lead/${second.id}/`));

  // ================================================================ a browser with NO session
  const anon = await browser.createBrowserContext();
  const trade1 = await anon.newPage();
  await trade1.setViewport({ width: 1280, height: 900 });
  const link = `${BASE}/lead/${first.id}/${token(first.id)}`;

  await trade1.goto(link, { waitUntil: "networkidle0" });
  const asked = await text(trade1);
  t("the link opens with no sign-in at all", /what is happening with this job/i.test(asked), asked.slice(0, 300));
  t("…showing which job it is", asked.includes(job.reference));
  t("…and the customer's name, which the email already carried", asked.includes("Casey Tester"));
  t("…offering both answers", /contacted the customer/i.test(asked) && /cannot take this job/i.test(asked));
  t("…and saying declining costs nothing", /credit goes back/i.test(asked));

  // ---- THE important one: a prefetch must not act
  const fresh = await db.leadAssignment.findUnique({ where: { id: first.id } });
  t("merely opening the link changes NOTHING", fresh.respondedAt === null && fresh.status !== "REVERSED",
    "a GET that acted would let mail scanners decline jobs on people's behalf");
  const prefetch = await fetch(link, { method: "GET" });
  t("…and a bare GET from something that is not a browser changes nothing either", prefetch.status === 200 &&
    (await db.leadAssignment.findUnique({ where: { id: first.id } })).respondedAt === null);

  // ---- a wrong signature is not found
  const wrong = await fetch(`${BASE}/lead/${first.id}/${token(second.id)}`);
  t("a token for another job is refused", wrong.status === 404);
  const truncated = await fetch(`${BASE}/lead/${first.id}/${token(first.id).slice(0, -3)}`);
  t("a truncated token is refused", truncated.status === 404);

  // ================================================================ "I have contacted the customer"
  await act(trade1, () => trade1.click('button::-p-text(I have contacted the customer)'));
  const confirmed = await text(trade1);
  t("answering is accepted", /noted/i.test(confirmed), confirmed.slice(0, 200));
  t("…and says they will not be chased again", /will not chase you/i.test(confirmed));
  const answered = await db.leadAssignment.findUnique({ where: { id: first.id } });
  t("the answer is recorded", answered.responseKind === "CALLED" && !!answered.respondedAt);
  t("…they keep the job", answered.status !== "REVERSED");
  t("…and they keep the credit", (await db.creditAccount.findUnique({ where: { businessId: first.businessId } })).balance === 3);
  t("…and it is in the audit log", !!(await db.auditLog.findFirst({ where: { targetType: "JobRequest", targetId: job.id, action: { contains: "contacted the customer" } } })));

  await trade1.goto(link, { waitUntil: "domcontentloaded" });
  t("coming back says there is nothing more to do", /nothing more to do/i.test(await text(trade1)));

  // ================================================================ "I cannot take this job"
  const trade2 = await anon.newPage();
  const link2 = `${BASE}/lead/${second.id}/${token(second.id)}`;
  const balanceBefore = (await db.creditAccount.findUnique({ where: { businessId: second.businessId } })).balance;
  await trade2.goto(link2, { waitUntil: "networkidle0" });
  await act(trade2, () => trade2.click('button::-p-text(I cannot take this job)'));
  const passedOn = await text(trade2);
  t("declining is accepted", /passed on to somebody else/i.test(passedOn), passedOn.slice(0, 200));
  t("…and says the credit is back", /credit has been put back/i.test(passedOn));

  const released = await db.leadAssignment.findUnique({ where: { id: second.id } });
  t("the job is released immediately", released.status === "REVERSED");
  t("…the credit is refunded", (await db.creditAccount.findUnique({ where: { businessId: second.businessId } })).balance === balanceBefore + 1);
  t("…with a REVERSAL row rather than a silent edit", !!(await db.creditTransaction.findFirst({ where: { assignmentId: second.id, kind: "REVERSAL" } })));
  t("…and the business is NOT handed the same job straight back",
    (await db.leadAssignment.count({ where: { jobRequestId: job.id, businessId: second.businessId, status: { not: "REVERSED" } } })) === 0,
    "the matcher re-runs on a decline; it must not give it to the business that just said no");

  // ================================================================ the administrator can see all of it
  const admin = await browser.newPage();
  const ADMIN_EMAIL = env.match(/ADMIN_EMAIL="(.*)"/)[1];
  const ADMIN_PW = env.match(/ADMIN_PASSWORD="(.*)"/)[1];
  await admin.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await admin.waitForSelector("#email", { timeout: 20000 });
  await admin.type("#email", ADMIN_EMAIL);
  await admin.type("#password", ADMIN_PW);
  await admin.click("form button:not([type=button])");
  await admin.waitForFunction(() => location.pathname === "/admin", { timeout: 20000 });
  await admin.goto(`${BASE}/admin/leads/${job.id}`, { waitUntil: "domcontentloaded" });
  const detail = await text(admin);
  t("the admin page shows what the business said", /said they contacted the customer/i.test(detail), detail.slice(0, 400));
  t("…and records the decline against the other one", /reversed/i.test(detail));
  t("…and the decision log explains why the decliner was not offered it again",
    /taken back or declined/i.test(detail), "otherwise 'why did they not get it?' has no answer");

  await admin.close();
  await trade1.close();
  await trade2.close();
  await anon.close();
  await page.close();
} finally {
  await browser.close();
  await cleanup();
  await db.$disconnect();
}

console.log(fail === 0 ? "\nALL LEAD RESPONSE E2E CHECKS PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
