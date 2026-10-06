// End-to-end tests with real browser (Edge via puppeteer-core). Run against `next start -p 3417`.
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3417";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PW = readFileSync(".env", "utf8").match(/ADMIN_PASSWORD="(.*)"/)[1];
const ADMIN_EMAIL = readFileSync(".env", "utf8").match(/ADMIN_EMAIL="(.*)"/)[1];
const db = new PrismaClient();
let fail = 0;
const t = (n, c) => { console.log(c ? "PASS" : "FAIL", n); if (!c) fail++; };

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle0" });
const text = () => page.evaluate(() => document.body.innerText);

// --- admin protection
await go("/admin");
t("unauthenticated /admin redirects to login", page.url().endsWith("/admin/login"));
await go("/admin/claims");
t("unauthenticated /admin/claims redirects", page.url().endsWith("/admin/login"));
await go("/admin/login");
await page.type("#email", ADMIN_EMAIL); await page.type("#password", "wrong-password");
await Promise.all([page.click('form:has(#password) button'), page.waitForFunction(() => document.body.innerText.includes("Incorrect email or password"), { timeout: 8000 })]);
t("wrong password shows error", true);
await page.$eval("#password", (e) => (e.value = ""));
await page.$eval("#email", (e) => (e.value = ""));
await page.type("#email", ADMIN_EMAIL); await page.type("#password", PW);
await Promise.all([page.click('form:has(#password) button'), page.waitForFunction(() => location.pathname === "/admin", { timeout: 10000 })]);
t("correct password reaches dashboard", (await text()).includes("Dashboard"));
const cookies = await page.cookies();
const c = cookies.find((x) => x.name === "ps_admin");
t("session cookie httpOnly + lax", !!c && c.httpOnly && c.sameSite === "Lax");

// --- claim → admin approve
await go("/claim?business=lea-valley-maids");
await page.type("#name", "Mia Owner"); await page.type("#role", "Director"); await page.type("#email", "mia@example.com");
await page.type("#phone", "+44 20 7946 0002"); await page.select("#relationship", "director"); await page.type("#verification", "Call me on the number listed; I own the domain.");
await Promise.all([page.click('main form button'), page.waitForFunction(() => document.body.innerText.includes("Request received"), { timeout: 10000 })]);
t("claim submitted via UI", true);
{ // new in Phase 5: the claimant must confirm their email before an admin can approve
  const m = await db.emailOutbox.findFirst({ where: { to: "mia@example.com" }, orderBy: { createdAt: "desc" } });
  const tok = m.body.match(/\/claim\/status\/([\w-]+)/)[1];
  await go("/claim/status/" + tok);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText === "Confirm my email").click());
  await new Promise((r) => setTimeout(r, 1500));
}
await go("/businesses/london/cleaning/lea-valley-maids");
t("profile shows Claim pending", (await text()).toUpperCase().includes("CLAIM PENDING"));
await go("/admin/claims");
t("claim visible in admin queue", (await text()).includes("Mia Owner"));
await Promise.all([page.waitForNavigation(), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.value === "APPROVE").click())]);
t("approve shows message", (await text()).includes("Claim approved"));
t("business now CLAIMED", (await db.business.findUnique({ where: { slug: "lea-valley-maids" } })).claimStatus === "CLAIMED");
await go("/businesses/london/cleaning/lea-valley-maids");
t("profile no longer shows claim CTA", !(await text()).includes("Is this your business?"));
await go("/businesses?status=claimed");
t("claimed filter lists it", (await text()).includes("Lea Valley Maids"));

// --- submission → approve
await go("/businesses/submit");
await page.type("#name", "E2E Corner Cafe"); await page.select("#category", "cafes"); await page.select("#area", "hackney");
await page.type("#description", "A tiny corner cafe serving filter coffee and toast to the local street.");
await page.type("#submitterName", "Sam"); await page.type("#submitterEmail", "sam@example.com");
await Promise.all([page.click('main form button'), page.waitForFunction(() => document.body.innerText.includes("we'll take a look"), { timeout: 10000 })]);
t("submission accepted", true);
await go("/admin/submissions");
await Promise.all([page.waitForNavigation(), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.value === "APPROVE").click())]);
t("submission approved → profile created", (await text()).includes("Approved"));
const created = await db.business.findFirst({ where: { name: "E2E Corner Cafe" } });
t("created business is unclaimed, real, published", created?.claimStatus === "UNCLAIMED" && !created.isSample && created.published);
await go("/businesses/london/cafes/e2e-corner-cafe");
t("new profile renders with claim CTA", (await text()).includes("Is this your business?"));

// --- admin edit + unpublish
await go(`/admin/businesses/${created.id}`);
await page.$eval("#phone", (e) => (e.value = "020 7946 0099"));
await Promise.all([page.waitForNavigation(), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText === "Save changes").click())]);
t("edit saved", (await text()).includes("Saved") && (await db.business.findUnique({ where: { id: created.id } })).phone === "020 7946 0099");
await page.goto(`${BASE}/admin/businesses/${created.id}`);
await page.$eval("#website", (e) => (e.value = "javascript:alert(1)"));
await Promise.all([page.waitForNavigation(), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText === "Save changes").click())]);
t("javascript: website rejected", (await text()).includes("valid http(s) URL"));
await go("/admin/businesses");
await Promise.all([page.waitForNavigation(), page.evaluate(() => [...document.querySelectorAll("tr")].find((r) => r.innerText.includes("E2E Corner Cafe")).querySelector("button").click())]);
const r404 = await page.goto(`${BASE}/businesses/london/cafes/e2e-corner-cafe`);
t("unpublished profile 404s publicly", r404.status() === 404);

// --- import via UI
await go("/admin/import");
const csv = `name,category,area,summary,description,source,website\nE2E Import Barbers,Beauty,Haringey,Barbers used by the import e2e test.,An original description long enough to satisfy the importer's sixty character rule.,E2E,https://e2e-barbers.example\n`;
await page.type("#csv", csv);
await Promise.all([page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.startsWith("Dry run")).click()), page.waitForFunction(() => document.body.innerText.includes("Dry run result"), { timeout: 10000 })]);
t("import dry run via UI", (await text()).includes("would be created") && !(await db.business.findFirst({ where: { name: "E2E Import Barbers" } })));
await Promise.all([page.click('button[name="apply"]'), page.waitForFunction(() => document.body.innerText.includes("Import complete"), { timeout: 10000 })]);
t("import applied via UI", !!(await db.business.findFirst({ where: { name: "E2E Import Barbers" } })));

// --- pagination
await go("/businesses");
t("directory page 1 shows pagination", (await text()).includes("Page 1 of 2"));
await go("/businesses?page=2");
t("page 2 noindex", (await page.$eval('meta[name="robots"]', (e) => e.content)).includes("noindex"));
await go("/businesses?page=999");
t("out-of-range page → empty state not crash", (await text()).includes("No businesses found") || (await text()).includes("businesses"));

// --- sign out
await go("/admin");
await Promise.all([page.waitForNavigation(), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText === "Sign out").click())]);
t("sign out returns to login", page.url().endsWith("/admin/login"));
await go("/admin/claims");
t("after sign out admin is protected", page.url().endsWith("/admin/login"));

// cleanup
await db.business.deleteMany({ where: { OR: [{ name: "E2E Corner Cafe" }, { name: "E2E Import Barbers" }] } });
await db.claimRequest.deleteMany({ where: { email: "mia@example.com" } });
await db.businessOwner.deleteMany({ where: { owner: { email: "mia@example.com" } } }); await db.owner.deleteMany({ where: { email: "mia@example.com" } }); await db.emailOutbox.deleteMany();
await db.businessSubmission.deleteMany(); await db.auditLog.deleteMany();
await db.business.update({ where: { slug: "lea-valley-maids" }, data: { claimStatus: "UNCLAIMED" } });
await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL E2E PASSED"); process.exit(fail ? 1 : 0);
