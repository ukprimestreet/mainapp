/**
 * End-to-end: a business registers itself, confirms its email, and an administrator approves it.
 *
 * Run against a server started with mail DISABLED:
 *
 *   npm run start:e2e      (MAIL_DOMAIN= MAIL_FROM= next start -p 3418)
 *   node scripts/e2e-registration.mjs
 *
 * **Mail must be off.** Every send writes to `EmailOutbox` first and only then calls Resend, so with
 * MAIL_DOMAIN unset the suite can read exactly what would have been sent without a single real email
 * leaving the building. A test that emails strangers is not a test.
 *
 * **Addresses use Ideal Postcodes' free test postcode `ID1 1QD`,** so running this costs nothing.
 *
 * Worth knowing what that exercises: postcodes.io does not know their fixture postcode, so the authority is
 * NOT resolved by GSS code. The locality candidates still appear, because the chosen address carries its own
 * coordinates and those drive the distance ranking. So this suite proves the degraded path works — real
 * addresses, real nearby areas, no official code — which is exactly what happens when postcodes.io is down.
 * The GSS path is covered by the unit suite against a real postcode, also free. No test spends money.
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

const MARK = "e2ereg";
const EMAIL = `owner@${MARK}.example`;
const NAME = "E2E Registration Cleaners";

async function cleanup() {
  const subs = await db.businessSubmission.findMany({ where: { submitterEmail: { contains: MARK } }, select: { id: true, businessId: true } });
  const ids = subs.map((s) => s.businessId).filter(Boolean);
  const biz = await db.business.findMany({ where: { OR: [{ name: { contains: "E2E Registration" } }, { id: { in: ids } }] }, select: { id: true } });
  const bizIds = biz.map((b) => b.id);
  if (bizIds.length) {
    await db.creditTransaction.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.creditAccount.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.businessServiceArea.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.businessCategory.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.businessOwner.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.auditLog.deleteMany({ where: { targetId: { in: bizIds } } });
    await db.business.deleteMany({ where: { id: { in: bizIds } } });
  }
  if (subs.length) {
    await db.auditLog.deleteMany({ where: { targetId: { in: subs.map((s) => s.id) } } });
    await db.businessSubmission.deleteMany({ where: { id: { in: subs.map((s) => s.id) } } });
  }
  await db.owner.deleteMany({ where: { email: { contains: MARK } } });
  await db.emailOutbox.deleteMany({ where: { to: { contains: MARK } } });
  await db.addressLookup.deleteMany({ where: { postcode: "ID1 1QD" } });
}

// The form refuses anything submitted in under four seconds, which is a real anti-abuse control and not
// something to work around. The suite simply respects it.
const MIN_FILL_MS = 4200;

const text = (page) => page.evaluate(() => document.body.innerText);

async function fillRegistration(page, { businessName = NAME, description, email = EMAIL } = {}) {
  const startedAt = Date.now();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle0" });

  await page.type("#businessName", businessName);
  await page.type("#description", description ?? "We clean homes and offices across east London. The same team every visit, no contract, and we bring our own materials.");
  await page.type("#phone", "020 7946 0199");
  await page.type("#website", "https://e2e-registration-cleaners.example");

  // ---- address lookup, on the free test postcode
  await page.type("#postcode", "ID1 1QD");
  await page.click("button::-p-text(Find my address)");
  await page.waitForSelector("fieldset ul li button", { timeout: 20000 });
  const addresses = await page.$$("fieldset ul li button");
  await addresses[0].click();

  // The address carries coordinates, so nearby areas are offered even though postcodes.io does not know
  // this fixture postcode. The person still has to confirm one: nothing is taken on trust.
  await page.waitForFunction(() => /which local area are you in/i.test(document.body.innerText), { timeout: 15000 });
  const candidates = await page.$$('button[aria-pressed]');
  if (candidates.length === 0) throw new Error("no locality candidates were offered");
  await candidates[0].click();
  await page.waitForFunction(() => /based in /i.test(document.body.innerText), { timeout: 10000 });

  // ---- services and areas
  await page.evaluate(() => {
    document.querySelector('input[name="categoryIds"]').click();
    document.querySelector('input[name="serviceAreaIds"]').click();
  });

  // ---- who they are
  await page.type("#contactName", "Erica Tester");
  await page.type("#contactRole", "Director");
  await page.type("#contactEmail", email);

  const waited = Date.now() - startedAt;
  if (waited < MIN_FILL_MS) await new Promise((r) => setTimeout(r, MIN_FILL_MS - waited));
  return { candidates: candidates.length };
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });

try {
  await cleanup();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // ================================================================ validation is server-side
  await fillRegistration(page, { description: "Too short." });
  await Promise.all([page.click('button::-p-text(Register my business)'), page.waitForNetworkIdle({ idleTime: 600 })]);
  const afterThin = await text(page);
  t("a thin description is refused, with the error on the field", /at least 60 characters/i.test(afterThin));
  t("…and nothing was recorded", (await db.businessSubmission.count({ where: { submitterEmail: EMAIL } })) === 0);

  // ================================================================ the happy path
  await fillRegistration(page);
  await page.click('button::-p-text(Register my business)');
  await page.waitForFunction(() => location.pathname === "/register/sent", { timeout: 30000 })
    .catch(async () => {
      const shown = await text(page);
      const errs = shown.split(/\r?\n/).filter((l) => /fix|at least|choose|recognise|valid/i.test(l)).join(" | ");
      throw new Error("did not reach /register/sent; still on " + page.url() + " :: " + errs);
    });
  t("a complete registration lands on the confirmation page", new URL(page.url()).pathname === "/register/sent", page.url());
  t("…which tells them to check their email", /check your email/i.test(await text(page)));

  const sub = await db.businessSubmission.findFirst({ where: { submitterEmail: EMAIL }, orderBy: { createdAt: "desc" } });
  t("a registration is recorded", !!sub);
  t("…as a REGISTRATION, pending", sub?.kind === "REGISTRATION" && sub?.status === "PENDING");
  t("…with the place the person chose", !!sub?.placeId);
  t("…the address they picked", !!sub?.address && !!sub?.udprn);
  t("…their categories and service areas", JSON.parse(sub.categoryIds).length >= 1 && JSON.parse(sub.serviceAreaIds).length >= 1);
  t("…and the email token stored only as a hash", !!sub?.emailTokenHash && sub.emailTokenHash.length === 64);
  t("NO listing exists yet", sub?.businessId === null);
  t("NO credits exist yet", (await db.creditAccount.count()) === (await db.creditAccount.count({ where: { business: { name: { not: NAME } } } })));
  t("the paid lookup was recorded as FREE, so the test cost nothing", (await db.addressLookup.findFirst({ where: { postcode: "ID1 1QD" } }))?.free === true);

  // ================================================================ the verification email
  const confirm = await db.emailOutbox.findFirst({ where: { to: EMAIL }, orderBy: { createdAt: "desc" } });
  t("a confirmation email was prepared", !!confirm && /confirm your email/i.test(confirm.subject));
  t("…from the accounts sender", confirm?.purpose === "accounts");
  t("…and it was NOT actually sent, because mail is off for this suite", confirm?.sentAt === null || confirm?.sentAt === undefined,
    "mail appears to be configured — restart the server with MAIL_DOMAIN unset");
  const link = (confirm?.body ?? "").match(/https?:\/\/\S+\/register\/verify\/\S+/)?.[0];
  t("…containing a verification link", !!link, confirm?.body?.slice(0, 120));

  await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle0" });
  t("the link confirms the email", /email confirmed/i.test(await text(page)));
  t("…and the database agrees", !!(await db.businessSubmission.findUnique({ where: { id: sub.id } }))?.emailVerifiedAt);
  await page.reload({ waitUntil: "networkidle0" });
  t("using the link twice says so rather than failing", /already confirmed|nothing more to do/i.test(await text(page)));

  // ================================================================ admin approval
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle0" });
  await page.type("#email", ADMIN_EMAIL);
  await page.type("#password", ADMIN_PW);
  await page.click("form button:not([type=button])");
  await page.waitForFunction(() => location.pathname === "/admin", { timeout: 20000 });
  t("an administrator can sign in", new URL(page.url()).pathname === "/admin", page.url());

  await page.goto(`${BASE}/admin/registrations`, { waitUntil: "networkidle0" });
  const queue = await text(page);
  t("the registration is in the admin queue", queue.includes(NAME));
  t("…flagged as email confirmed", /email confirmed/i.test(queue));
  t("…and the queue shows what approving will do", /grants five lead credits|grant.*credits/i.test(queue));

  await page.click('button::-p-text(Approve and publish)');
  await page.waitForFunction(() => /msg=/.test(location.search), { timeout: 30000 });
  await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
  const approved = await text(page);
  t("approving reports success", /is live/i.test(approved), approved.slice(0, 160));

  const biz = await db.business.findFirst({ where: { name: NAME }, include: { owners: true, categories: true, serviceAreas: true, creditAccount: true } });
  t("the listing now exists", !!biz);
  t("…published", biz?.published === true);
  t("…claimed, not verified, because the evidence did not support verified", biz?.claimStatus === "CLAIMED");
  t("…pointing at the new geography", !!biz?.placeId);
  t("…with its categories", biz.categories.length >= 1 && biz.categories.some((c) => c.isPrimary));
  t("…and its service areas", biz.serviceAreas.length >= 1);
  t("the owner was created and linked", biz.owners.length === 1 && !!(await db.owner.findUnique({ where: { email: EMAIL } })));
  t("five welcome credits were granted", biz.creditAccount?.balance === 5, `${biz.creditAccount?.balance}`);
  t("…as exactly one FREE_GRANT row", (await db.creditTransaction.count({ where: { businessId: biz.id, kind: "FREE_GRANT" } })) === 1);
  t("…and the grant is marked so it cannot happen twice", !!biz.creditAccount?.freeGrantAt);

  const live = await db.emailOutbox.findFirst({ where: { to: EMAIL, subject: { contains: "is live" } } });
  t("the owner was emailed that it is live", !!live);
  t("…with a link to their dashboard", /\/owner/.test(live?.body ?? ""));
  t("…and the promise that money cannot buy a rating", /never do/i.test(live?.body ?? ""));

  const trail = await db.auditLog.findFirst({ where: { targetId: biz.id, action: { contains: "approved" } } });
  t("the approval is in the audit log", !!trail);
  t("…recording the credits granted", /credits/i.test(trail?.detail ?? ""));

  // ================================================================ the duplicate interruption, now that the listing exists
  await fillRegistration(page, { email: `second@${MARK}.example` });
  await Promise.all([page.click('button::-p-text(Register my business)'), page.waitForNetworkIdle({ idleTime: 800 })]);
  const dupText = await text(page);
  t("registering the same business again is interrupted", /already on primestreet/i.test(dupText), dupText.slice(0, 160));
  t("…offering to claim the existing listing instead", /claim/i.test(dupText));
  t("…and saying why it matched", /matched it on/i.test(dupText));
  t("…with no second registration recorded", (await db.businessSubmission.count({ where: { submitterEmail: `second@${MARK}.example` } })) === 0);

  await page.goto(`${BASE}/admin/registrations`, { waitUntil: "networkidle0" });
  t("the queue is now clear of it", !/waiting/i.test((await text(page)).split("What approving does")[0]) || !(await text(page)).includes("Approve and publish"));

  await page.close();
} finally {
  await browser.close();
  await cleanup();
  await db.$disconnect();
}

console.log(fail === 0 ? "\nALL REGISTRATION E2E CHECKS PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
