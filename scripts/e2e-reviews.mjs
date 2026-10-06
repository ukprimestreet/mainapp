// Reviews end-to-end tests. Run against `next start -p 3417` with a seeded DB.
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3417";
const ENV = readFileSync(".env", "utf8");
const PW = ENV.match(/ADMIN_PASSWORD="(.*)"/)[1];
const ADMIN_EMAIL = ENV.match(/ADMIN_EMAIL="(.*)"/)[1];
const SECRET = ENV.match(/SESSION_SECRET="(.*)"/)[1];
const db = new PrismaClient();
let fail = 0;
const t = (n, c) => { console.log(c ? "PASS" : "FAIL", n); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle0" });
const text = () => page.evaluate(() => document.body.innerText);
const setv = (sel, v) => page.$eval(sel, (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, v);
const clickText = (label, sel = "button") => page.evaluate((l, s) => { const b = [...document.querySelectorAll(s)].find((x) => x.innerText.trim() === l); if (!b) throw new Error("no " + l); b.click(); }, label, sel);
const ipHeader = (ip) => page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
const cleanup = async () => {
  await db.review.deleteMany({ where: { business: { slug: { startsWith: "e2e-rev-" } } } });
  await db.business.deleteMany({ where: { slug: { startsWith: "e2e-rev-" } } });
  await db.emailOutbox.deleteMany(); await db.auditLog.deleteMany({ where: { targetType: "Review" } });
};
await cleanup();
const city = await db.city.findFirst(); const loc = await db.location.findFirst({ where: { slug: "hackney" } }); const cat = await db.category.findUnique({ where: { slug: "cafes" } });
const mkBiz = (slug, name, extra = {}) => db.business.create({ data: { slug, name, summary: "An e2e review test business.", description: "d".repeat(80), cityId: city.id, locationId: loc.id, categoryId: cat.id, isSample: false, ...extra } });
const cafe = await mkBiz("e2e-rev-cafe", "E2E Review Cafe", { websiteHost: "e2ecafe.example" });
const gym = await mkBiz("e2e-rev-gym", "E2E Review Gym", { claimStatus: "CLAIMED" });
const tokenFor = async (email) => { const m = await db.emailOutbox.findFirst({ where: { to: email, body: { contains: "/reviews/manage/" } }, orderBy: { createdAt: "desc" } }); return m?.body.match(/\/reviews\/manage\/([\w-]+)/)?.[1]; };

async function writeReview(slug, r, { wait = 4800, expect = "Check your email" } = {}) {
  await go(`/review/${slug}`);
  if (r.rating) await page.evaluate((n) => document.querySelector(`input[name=rating][value="${n}"]`).click(), r.rating);
  if (r.title) await setv("#title", r.title);
  await setv("#body", r.body); await setv("#authorName", r.name ?? "Sam T"); await setv("#email", r.email);
  if (r.honeypot) await page.$eval('input[name="contact_fax"]', (e, v) => (e.value = v), "x");
  await sleep(wait);
  await clickText("Submit review");
  await page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 8000 }, expect).catch(() => {});
  return text();
}
const GOOD = "I went on a Saturday morning and the flat white was excellent, staff were friendly and the place was spotless.";

// --- sample + pages
const sampleBiz = await db.business.findFirst({ where: { isSample: true } });
await go(`/review/${sampleBiz.slug}`);
t("sample business can't be reviewed", (await text()).includes("sample business"));
await go("/review/does-not-exist");
t("unknown business → 404 page", (await text()).includes("404") || (await text()).includes("couldn't find"));
await go(`/businesses/london/cafes/${cafe.slug}`);
t("profile: empty state invites first review", (await text()).includes("Be the first"));
t("profile: no aggregateRating schema when no reviews", !(await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => x.textContent).join(""))).includes("aggregateRating"));

// --- validation, too-fast, honeypot
let out = await writeReview(cafe.slug, { rating: 4, body: GOOD, email: "sam@example.com" }, { wait: 300, expect: "very quick" });
t("bot-fast submit refused", out.includes("very quick") && (await db.review.count()) === 0);
await go(`/review/${cafe.slug}`);
await setv("#body", "too short"); await setv("#authorName", "S"); await setv("#email", "nope"); await sleep(4800); await clickText("Submit review"); await sleep(1500);
out = await text();
t("validation: rating/body/name/email errors", out.includes("Choose a rating") && out.includes("at least 40") && out.includes("Enter the name") && out.includes("valid email"));
t("validation: typed values preserved", (await page.$eval("#body", (e) => e.value)) === "too short" && (await page.$eval("#email", (e) => e.value)) === "nope");
out = await writeReview(cafe.slug, { rating: 5, body: GOOD, email: "bot@example.com", honeypot: true });
t("honeypot: looks successful but stores nothing", out.includes("Check your email") && (await db.review.count()) === 0);

// --- happy path: submit -> unverified -> confirm -> pending -> publish
out = await writeReview(cafe.slug, { rating: 4, title: "Lovely spot", body: GOOD, name: "Sam T", email: "sam@example.com" });
t("submit → check-your-email message", out.includes("Check your email"));
let rev = await db.review.findFirst({ where: { businessId: cafe.id } });
t("stored UNVERIFIED, hashed token, hashed IP, not public", rev?.status === "UNVERIFIED" && rev.tokenHash.length === 64 && rev.ipHash.length === 32 && !rev.ipHash.includes("local"));
const token1 = await tokenFor("sam@example.com");
t("verification email recorded in outbox with manage link", !!token1 && rev.tokenHash !== token1);
await go(`/businesses/london/cafes/${cafe.slug}`);
t("unverified review NOT public", !(await text()).includes("Lovely spot"));
await go(`/reviews/manage/${token1}`);
await go(`/reviews/manage/${token1}`);
t("manage page loads without confirming (GET is safe)", (await db.review.findUnique({ where: { id: rev.id } })).status === "UNVERIFIED");
await clickText("Confirm my email"); await sleep(1500);
rev = await db.review.findUnique({ where: { id: rev.id } });
t("confirm (POST) → PENDING", rev.status === "PENDING" && !!rev.emailVerifiedAt);
await go(`/businesses/london/cafes/${cafe.slug}`);
t("pending review NOT public", !(await text()).includes("Lovely spot"));
t("manage: invalid token page", await (async () => { await go("/reviews/manage/not-a-token"); return (await text()).includes("Link not valid"); })());

// --- admin gate + moderation
await ipHeader("203.0.113.1");
const anon = await fetch(BASE + "/admin/reviews", { redirect: "manual" });
t("admin reviews requires login", anon.status === 307 || anon.status === 308 || anon.status === 302);
await go("/admin/login"); await page.type("#email", ADMIN_EMAIL); await page.type("#password", PW);
await Promise.all([page.click('form:has(#password) button'), page.waitForFunction(() => location.pathname === "/admin")]);
await go("/admin/reviews?tab=pending");
t("pending review in queue", (await text()).includes("Lovely spot") || (await text()).includes("sam@example.com"));
await clickText("Publish"); await sleep(1500);
rev = await db.review.findUnique({ where: { id: rev.id } });
t("published; email sent to reviewer", rev.status === "PUBLISHED" && (await db.emailOutbox.count({ where: { to: "sam@example.com", subject: { contains: "is live" } } })) === 1);
let b = await db.business.findUnique({ where: { id: cafe.id } });
t("rating denormalised (4.0 from 1)", b.ratingAvg === 4 && b.ratingCount === 1);
await go(`/businesses/london/cafes/${cafe.slug}`);
out = await text();
t("public: review, name, rating shown", out.includes("Lovely spot") && out.includes("Sam T") && out.includes("4.0"));
const ld = (await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)))).flat().find((x) => x["@type"] === "LocalBusiness");
t("JSON-LD aggregateRating + Review match visible data", ld.aggregateRating?.ratingValue === 4 && ld.aggregateRating.reviewCount === 1 && ld.review?.[0]?.reviewRating?.ratingValue === 4 && ld.review[0].author.name === "Sam T");
await go("/businesses?q=E2E+Review");
t("directory card shows rating", (await text()).includes("4.0"));

// --- duplicate review: generic response, no 2nd row
out = await writeReview(cafe.slug, { rating: 1, body: "Trying to submit a second review for the very same cafe again today.", email: "SAM@example.com" });
t("duplicate: same generic success, no 2nd row", out.includes("Check your email") && (await db.review.count({ where: { businessId: cafe.id } })) === 1);
t("duplicate: fresh manage link re-sent", !!(await tokenFor("sam@example.com")) && (await tokenFor("sam@example.com")) !== token1);
const token1b = await tokenFor("sam@example.com");
await go(`/reviews/manage/${token1}`);
t("old token invalidated by re-send", (await text()).includes("Link not valid"));

// --- hostile content + signals + XSS escaped
const evil = `<script>window.__x=1</script> Great! Visit www.cheapseo.biz or call 020 7946 0958 — AMAZINGSERVICEHERE`;
out = await writeReview(cafe.slug, { rating: 2, title: "<b>bold</b> title", body: evil + " " + GOOD, name: "<i>Mallory</i>", email: "mallory@mailinator.com" });
const evilRev = await db.review.findFirst({ where: { authorEmail: "mallory@mailinator.com" } });
t("spam signals recorded", ["contains-link", "contains-phone", "shouting", "disposable-email"].every((f) => evilRev.flags.includes(f)));
const tokM = await tokenFor("mallory@mailinator.com");
await go(`/reviews/manage/${tokM}`); await clickText("Confirm my email"); await sleep(1200);
await go("/admin/reviews?tab=pending");
t("admin sees ⚑ signals", (await text()).includes("contains-link") && (await text()).includes("disposable-email"));
await clickText("Publish"); await sleep(1500);
await go(`/businesses/london/cafes/${cafe.slug}`);
t("hostile markup rendered as inert text", await page.evaluate(() => !window.__x && !document.querySelector("#reviews ~ ul script, #reviews ~ ul b, #reviews ~ ul i")) && (await text()).includes("<b>bold</b> title"));
b = await db.business.findUnique({ where: { id: cafe.id } });
t("rating recalculated (3.0 from 2)", b.ratingAvg === 3 && b.ratingCount === 2);

// --- reporting → auto-hold after 3 distinct reporters
const mallRev = await db.review.findUnique({ where: { id: evilRev.id } });
async function report(ip, reason = "SPAM") {
  await ipHeader(ip); await go(`/businesses/london/cafes/${cafe.slug}`);
  await page.evaluate((id) => { const li = document.getElementById(`review-${id}`); li.querySelector("details").open = true; }, mallRev.id);
  await page.select(`#reason-${mallRev.id}`, reason);
  await sleep(1700);
  await page.evaluate((id) => [...document.getElementById(`review-${id}`).querySelectorAll("button")].find((b) => b.innerText === "Send report").click(), mallRev.id);
  await page.waitForFunction(() => document.body.innerText.includes("Thanks"), { timeout: 6000 }).catch(() => {});
  return text();
}
await report("198.51.100.1");
t("1st report: stays public", (await db.review.findUnique({ where: { id: mallRev.id } })).status === "PUBLISHED");
out = await report("198.51.100.1");
t("same reporter twice counts once (friendly message)", out.includes("already have your report") && (await db.reviewReport.count({ where: { reviewId: mallRev.id } })) === 1);
await report("198.51.100.2"); await report("198.51.100.3");
t("3 distinct reporters → auto-HELD + hidden", (await db.review.findUnique({ where: { id: mallRev.id } })).status === "HELD");
await ipHeader("203.0.113.1"); await go(`/businesses/london/cafes/${cafe.slug}`);
t("held review not public; rating recalculated to 4.0 from 1", !(await text()).includes("Mallory") && (await db.business.findUnique({ where: { id: cafe.id } })).ratingAvg === 4);
await go("/admin/reviews?tab=held");
t("held tab lists it with report reasons", (await text()).includes("held-after-reports") && (await text()).includes("Spam or advertising"));
await clickText("Reject");
await sleep(1000);
t("reject requires a reason", (await text()).includes("Add a short reason") && (await db.review.findUnique({ where: { id: mallRev.id } })).status === "HELD");
await page.type(`#n-${mallRev.id}`, "Contains advertising and a phone number");
await clickText("Reject"); await sleep(1500);
t("rejected + reviewer emailed with reason", (await db.review.findUnique({ where: { id: mallRev.id } })).status === "REJECTED" && (await db.emailOutbox.count({ where: { to: "mallory@mailinator.com", body: { contains: "Contains advertising" } } })) === 1);
await go(`/reviews/manage/${tokM}`);
t("rejected review can't be edited", (await text()).includes("Not published") && !(await page.$("main form button")));

// --- rate limiting (per IP): seed 5 reviews for this IP hash then try again
const ipHash = createHash("sha256").update(`${SECRET}|198.51.100.50`).digest("hex").slice(0, 32);
for (let i = 0; i < 5; i++) await db.review.create({ data: { businessId: gym.id, authorName: "R", authorEmail: `rl${i}@x.com`, authorEmailHash: createHash("sha256").update(`rl${i}`).digest("hex"), rating: 3, body: "r".repeat(50), status: "REJECTED", ipHash, bodyHash: "rl" + i } });
await ipHeader("198.51.100.50");
out = await writeReview(cafe.slug, { rating: 3, body: GOOD + " Different words entirely for this one.", email: "limit@example.com" }, { expect: "several reviews" });
t("per-IP daily limit enforced", out.includes("several reviews today") && !(await db.review.findFirst({ where: { authorEmail: "limit@example.com" } })));
await ipHeader("203.0.113.1");
for (let i = 0; i < 3; i++) await db.review.create({ data: { businessId: gym.id, authorName: "R", authorEmail: "same@x.com", authorEmailHash: createHash("sha256").update("same@x.com").digest("hex") + i, rating: 3, body: "r".repeat(50), status: "REJECTED", ipHash: "z" + i, bodyHash: "sm" + i } });
await db.review.deleteMany({ where: { authorEmail: { startsWith: "rl" } } });
// (per-email limit uses the real hash; emulate 3 recent reviews by same email on other businesses)
await db.review.deleteMany({ where: { authorEmail: "same@x.com" } });
const eh = createHash("sha256").update("limit2@example.com").digest("hex");
const others = [await mkBiz("e2e-rev-o1", "E2E Rev O1"), await mkBiz("e2e-rev-o2", "E2E Rev O2"), await mkBiz("e2e-rev-o3", "E2E Rev O3")];
for (const [i, o] of others.entries()) await db.review.create({ data: { businessId: o.id, authorName: "R", authorEmail: "limit2@example.com", authorEmailHash: eh, rating: 3, body: "r".repeat(50), status: "REJECTED", ipHash: "q" + i, bodyHash: "le" + i } });
out = await writeReview(gym.slug, { rating: 3, body: "Another genuine sounding review that has enough characters in it.", email: "limit2@example.com" }, { expect: "several reviews" });
t("per-email daily limit enforced", out.includes("several reviews today"));

// --- business response (claimed only)
await db.review.deleteMany({ where: { businessId: gym.id } });
out = await writeReview(gym.slug, { rating: 5, body: "Brilliant gym with plenty of kit and friendly coaches who really know their stuff.", email: "gymfan@example.com" });
const gtok = await tokenFor("gymfan@example.com");
await go(`/reviews/manage/${gtok}`); await clickText("Confirm my email"); await sleep(1200);
await go("/admin/reviews?tab=pending"); await clickText("Publish"); await sleep(1500);
await go("/admin/reviews?tab=published");
await page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("E2E Review Gym") && l.querySelector("textarea")); li.querySelector("textarea").value = "Thank you for the kind words — see you at the next class!"; });
await page.evaluate(() => [...document.querySelectorAll("li")].find((l) => l.innerText.includes("E2E Review Gym") && l.querySelector("textarea")).querySelector("form:last-of-type button").click()); await sleep(1500);
await go(`/businesses/london/cafes/${gym.slug}`);
t("response from CLAIMED business shown publicly", (await text()).includes("Response from E2E Review Gym") && (await text()).includes("see you at the next class"));
// unclaimed business: response refused
await go("/admin/reviews?tab=published");
const cafeReviewCount = await db.review.count({ where: { businessId: cafe.id, status: "PUBLISHED" } });
await page.evaluate(() => { const ta = [...document.querySelectorAll("textarea")].find((x) => x.id.startsWith("r-") && x.closest("li").innerText.includes("E2E Review Cafe")); ta.value = "We are the owners and here is our reply to this review."; });
await page.evaluate(() => [...document.querySelectorAll("li")].find((l) => l.innerText.includes("E2E Review Cafe")).querySelector("form:last-of-type button").click()); await sleep(1500);
t("response refused for UNCLAIMED business", (await text()).includes("Only claimed or verified") && cafeReviewCount === 1 && !(await db.review.findFirst({ where: { businessId: cafe.id, response: { not: null } } })));

// --- edit by reviewer (live → re-moderation), delete (hard)
await go(`/reviews/manage/${await tokenFor("sam@example.com")}`);
await setv("#body", "Updated: still a lovely cafe and the staff remembered my order which was a nice touch indeed.");
await clickText("Save changes"); await sleep(1500);
rev = await db.review.findUnique({ where: { id: rev.id } });
t("editing a live review sends it back to PENDING + marks edited", rev.status === "PENDING" && !!rev.editedAt && rev.body.startsWith("Updated"));
await go(`/businesses/london/cafes/${cafe.slug}`);
t("edited review hidden until re-approved; rating cleared", !(await text()).includes("Updated: still") && (await db.business.findUnique({ where: { id: cafe.id } })).ratingCount === 0);
await go(`/reviews/manage/${await tokenFor("sam@example.com")}`);
page.once("dialog", (d) => d.accept());
await clickText("Delete my review"); await sleep(1500);
t("delete = hard delete (PII gone)", (await db.review.count({ where: { id: rev.id } })) === 0 && (await text()).includes("permanently") || (await text()).includes("deleted"));

// --- directory rating filter/sort
await db.business.update({ where: { id: gym.id }, data: { ratingAvg: 5, ratingCount: 1 } });
await go("/businesses?rating=4");
t("rating filter ≥4 lists only rated businesses", (await text()).includes("E2E Review Gym") && !(await text()).includes("Brightwell"));
await go("/businesses?sort=rating");
t("sort=top rated puts rated business first", (await page.$eval("main article h2, main article h3", (e) => e.innerText)).includes("E2E Review Gym"));
await go("/businesses?sort=rating");
t("filtered/sorted directory is noindex", (await page.$eval('meta[name="robots"]', (e) => e.content)).includes("noindex"));

// --- misc
await go("/admin/outbox");
t("outbox page explains no provider", (await text()).includes("NOT delivered") || (await text()).includes("provider configured"));
await go(`/reviews/manage/${token1b}`);
t("manage/review pages are noindex", (await page.$eval('meta[name="robots"]', (e) => e.content)).includes("noindex"));
t("robots.txt blocks manage links", (await (await fetch(BASE + "/robots.txt")).text()).includes("/reviews/manage"));

await cleanup(); await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL REVIEW E2E PASSED"); process.exit(fail ? 1 : 0);
