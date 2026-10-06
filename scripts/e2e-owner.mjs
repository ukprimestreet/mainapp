// Business claiming + owner dashboard end-to-end tests. Run against `next start -p 3417` with a seeded DB.
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3417";
const PW = readFileSync(".env", "utf8").match(/ADMIN_PASSWORD="(.*)"/)[1];
const ADMIN_EMAIL = readFileSync(".env", "utf8").match(/ADMIN_EMAIL="(.*)"/)[1];
const db = new PrismaClient();
const sha = (x) => createHash("sha256").update(x).digest("hex");
let fail = 0;
const t = (n, c) => { console.log(c ? "PASS" : "FAIL", n); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });

async function newPage() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const api = {
    page, ctx,
    go: (p) => page.goto(BASE + p, { waitUntil: "networkidle0" }),
    text: () => page.evaluate(() => document.body.innerText),
    setv: (sel, v) => page.$eval(sel, (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, v),
    click: async (label, scope) => { await page.evaluate((l, sc) => { const root = sc ? [...document.querySelectorAll("li")].find((x) => x.innerText.includes(sc)) : document; const b = [...root.querySelectorAll("button,a")].find((x) => x.innerText.trim().startsWith(l)); if (!b) throw new Error("no button: " + l); b.click(); }, label, scope); await sleep(1600); },
  };
  return api;
}
const admin = await newPage(), anon = await newPage(), o1 = await newPage(), o2 = await newPage();
const cleanup = async () => {
  const biz = await db.business.findMany({ where: { slug: { startsWith: "e2e-own-" } }, select: { id: true } });
  const ids = biz.map((b) => b.id);
  await db.review.deleteMany({ where: { businessId: { in: ids } } });
  await db.claimRequest.deleteMany({ where: { businessId: { in: ids } } });
  await db.businessOwner.deleteMany({ where: { businessId: { in: ids } } });
  await db.business.deleteMany({ where: { id: { in: ids } } });
  await db.owner.deleteMany({ where: { email: { in: ["ana@alpha.example", "bea@gmail.com", "cy@gmail.com", "dee@gmail.com", "ghost@nowhere.example"] } } });
  await db.emailOutbox.deleteMany(); await db.auditLog.deleteMany();
};
await cleanup();

const city = await db.city.findFirst(), loc = await db.location.findFirst({ where: { slug: "hackney" } }), cat = await db.category.findUnique({ where: { slug: "cafes" } });
const mk = (slug, name, extra = {}) => db.business.create({ data: { slug, name, summary: "An e2e ownership test business.", description: "An original e2e description that is certainly long enough to be valid here.", cityId: city.id, locationId: loc.id, categoryId: cat.id, isSample: false, ...extra } });
const alpha = await mk("e2e-own-alpha", "E2E Own Alpha", { website: "https://alpha.example", websiteHost: "alpha.example", phone: "020 7946 0100" });
const beta = await mk("e2e-own-beta", "E2E Own Beta", { phone: "020 7946 0200", summary: "Beta original summary text." });
const gamma = await mk("e2e-own-gamma", "E2E Own Gamma");
const outboxLink = async (to, re) => (await db.emailOutbox.findMany({ where: { to }, orderBy: { createdAt: "desc" } })).map((m) => m.body.match(re)?.[1]).find(Boolean);
const profilePath = (slug) => `/businesses/london/cafes/${slug}`;

async function fillClaim(p, slug, { name, email, phone = "+44 20 7946 0999" }) {
  await p.go(`/claim?business=${slug}`);
  await p.setv("#name", name); await p.setv("#role", "Director"); await p.setv("#email", email); await p.setv("#phone", phone);
  await p.setv("#relationship", "director"); await p.setv("#verification", "I am the director; call the listed number to check.");
  await p.page.evaluate(() => [...document.querySelectorAll("form button")].find((b) => b.innerText.includes("Submit")).click());
  await p.page.waitForFunction(() => document.body.innerText.includes("Request received") || document.body.innerText.includes("already been claimed"), { timeout: 10000 }).catch(() => {});
}
async function loginAs(p, email) {
  const owner = await db.owner.findUnique({ where: { email } });
  const raw = randomBytes(18).toString("base64url");
  await db.ownerLoginToken.create({ data: { ownerId: owner.id, tokenHash: sha(raw), expiresAt: new Date(Date.now() + 600000) } });
  await p.go(`/owner/login/${raw}`); await p.click("Sign in");
}

// admin login
await admin.go("/admin/login"); await admin.page.type("#email", ADMIN_EMAIL); await admin.page.type("#password", PW);
await Promise.all([admin.page.click('form:has(#password) button'), admin.page.waitForFunction(() => location.pathname === "/admin")]);

// ===== 1. claim → email evidence ==========================================
await fillClaim(anon, alpha.slug, { name: "Ana Alpha", email: "ana@alpha.example" });
t("claim submit tells claimant to check email", (await anon.text()).includes("check your email"));
let claim = await db.claimRequest.findFirst({ where: { businessId: alpha.id } });
t("claim stored: PENDING, domain match detected, email NOT yet verified", claim.status === "PENDING" && claim.domainMatch === true && claim.emailVerifiedAt === null && claim.tokenHash.length === 64);
t("business shows Claim pending", (await db.business.findUnique({ where: { id: alpha.id } })).claimStatus === "PENDING");
const tok1 = await outboxLink("ana@alpha.example", /\/claim\/status\/([\w-]+)/);
t("status link emailed (token not stored raw)", !!tok1 && claim.tokenHash !== tok1);

await admin.go("/admin/claims");
t("admin sees evidence: email NOT confirmed, domain matches", (await admin.text()).includes("Email NOT confirmed") && (await admin.text()).includes("website domain (alpha.example)"));
await admin.click("Approve");
t("approval BLOCKED until email confirmed", (await admin.text()).includes("hasn't confirmed their email") && (await db.claimRequest.findUnique({ where: { id: claim.id } })).status === "PENDING");
await anon.go(`/claim/status/${tok1}`); await anon.go(`/claim/status/${tok1}`);
t("visiting the status link does NOT confirm (POST required)", (await db.claimRequest.findUnique({ where: { id: claim.id } })).emailVerifiedAt === null);
await anon.click("Confirm my email");
t("confirming email works", (await db.claimRequest.findUnique({ where: { id: claim.id } })).emailVerifiedAt !== null);
t("status page invalid token", await (async () => { await anon.go("/claim/status/nope"); return (await anon.text()).includes("Link not valid"); })());

// re-submit same claim → generic ok + fresh link, old one dead
await fillClaim(anon, alpha.slug, { name: "Ana Alpha", email: "ana@alpha.example" });
const tok1b = await outboxLink("ana@alpha.example", /\/claim\/status\/([\w-]+)/);
t("duplicate claim: no second row, fresh link", (await db.claimRequest.count({ where: { businessId: alpha.id } })) === 1 && tok1b !== tok1);
await anon.go(`/claim/status/${tok1}`);
t("old status link invalidated", (await anon.text()).includes("Link not valid"));

// ===== 2. approval (Verified via domain match) ============================
await admin.go("/admin/claims");
t("evidence now shows email confirmed", (await admin.text()).includes("Email confirmed by claimant"));
await admin.page.evaluate(() => document.querySelector('input[name="verified"]').click());
await admin.click("Approve");
const biz1 = await db.business.findUnique({ where: { id: alpha.id } });
t("approved as VERIFIED, owner account + link created", biz1.claimStatus === "VERIFIED" && (await db.businessOwner.count({ where: { businessId: alpha.id } })) === 1 && (await db.owner.count({ where: { email: "ana@alpha.example" } })) === 1);
t("approval email sent", (await db.emailOutbox.count({ where: { to: "ana@alpha.example", subject: { contains: "approved" } } })) === 1);
await anon.go(profilePath(alpha.slug));
t("public profile: Verified, no claim CTA, dispute link", (await anon.text()).toUpperCase().includes("VERIFIED") && !(await anon.text()).includes("Is this your business?") && (await anon.text()).includes("Dispute this claim"));
await fillClaim(anon, alpha.slug, { name: "Late Claimer", email: "late@alpha2.example" });
t("claimed business can't be re-claimed (not offered, nothing stored)", (await db.claimRequest.count({ where: { email: "late@alpha2.example" } })) === 0 && (await db.business.findUnique({ where: { id: alpha.id } })).claimStatus === "VERIFIED");

// ===== 3. passwordless sign-in security ===================================
await o1.go("/owner/login");
await o1.setv("#email", "ghost@nowhere.example"); await o1.click("Email me a sign-in link");
t("unknown email: same message, nothing sent (no enumeration)", (await o1.text()).includes("sign-in link is on its way") && (await db.emailOutbox.count({ where: { to: "ghost@nowhere.example" } })) === 0);
await o1.go("/owner/login"); await o1.setv("#email", "ana@alpha.example"); await o1.click("Email me a sign-in link");
t("known email: same message + link emailed", (await o1.text()).includes("sign-in link is on its way") && !!(await outboxLink("ana@alpha.example", /\/owner\/login\/([\w-]+)/)));
const lt = await outboxLink("ana@alpha.example", /\/owner\/login\/([\w-]+)/);
await o1.go(`/owner/login/${lt}`); await o1.go(`/owner/login/${lt}`);
t("viewing the sign-in link does not consume it", (await db.ownerLoginToken.findUnique({ where: { tokenHash: sha(lt) } })).usedAt === null);
await o1.go("/owner");
t("no session yet → bounced to sign-in", o1.page.url().endsWith("/owner/login"));
await o1.go(`/owner/login/${lt}`); await o1.click("Sign in");
t("sign-in succeeds → dashboard", o1.page.url().endsWith("/owner") && (await o1.text()).includes("E2E Own Alpha"));
const ck = (await o1.page.cookies()).find((c) => c.name === "ps_owner");
t("owner cookie httpOnly + lax", !!ck && ck.httpOnly && ck.sameSite === "Lax");
await o2.go(`/owner/login/${lt}`);
t("single-use: reuse refused", (await o2.text()).includes("already been used"));
const ow1 = await db.owner.findUnique({ where: { email: "ana@alpha.example" } });
const rawExp = randomBytes(12).toString("base64url");
await db.ownerLoginToken.create({ data: { ownerId: ow1.id, tokenHash: sha(rawExp), expiresAt: new Date(Date.now() - 1000) } });
await o2.go(`/owner/login/${rawExp}`);
t("expired link refused", (await o2.text()).includes("expired"));
await o2.go("/owner/login/garbage");
t("garbage link refused", (await o2.text()).includes("isn't valid"));
t("admin cookie can't open owner area / owner can't open admin", await (async () => { await admin.go("/owner"); const a = admin.page.url().endsWith("/owner/login"); await o1.go("/admin/claims"); return a && o1.page.url().endsWith("/admin/login"); })());
t("forged owner cookie rejected", await (async () => { await o2.page.setCookie({ name: "ps_owner", value: "eyJvIjoieCJ9.forged", url: BASE }); await o2.go("/owner"); return o2.page.url().endsWith("/owner/login"); })());
await o2.page.deleteCookie({ name: "ps_owner", url: BASE });

// ===== 4. views counter ====================================================
const before = (await db.businessStat.aggregate({ where: { businessId: alpha.id }, _sum: { views: true } }))._sum.views ?? 0;
await fetch(BASE + profilePath(alpha.slug), { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36" } });
await fetch(BASE + profilePath(alpha.slug), { headers: { "user-agent": "Googlebot/2.1" } });
await fetch(BASE + profilePath(alpha.slug), { headers: { "user-agent": "python-requests/2.0" } });
const after = (await db.businessStat.aggregate({ where: { businessId: alpha.id }, _sum: { views: true } }))._sum.views ?? 0;
t("view counter: human +1, bots ignored", after - before === 1);

// ===== 5. profile editing ==================================================
await o1.go(`/owner/business/${alpha.id}`);
await o1.setv("#summary", "short"); await o1.setv("#website", "javascript:alert(1)"); await o1.setv("#phone", "abc"); await o1.setv("#founded", "99");
await o1.click("Save changes");
const ed = await o1.text();
t("validation: summary, website, phone, year errors", ed.includes("at least 10 characters") && ed.includes("valid http(s) web address") && ed.includes("valid phone number") && ed.includes("four-digit year"));
t("typed values preserved after error", (await o1.page.$eval("#summary", (e) => e.value)) === "short");
t("nothing saved on error", (await db.business.findUnique({ where: { id: alpha.id } })).summary === "An e2e ownership test business.");
await o1.go(`/owner/business/${alpha.id}`);
await o1.page.evaluate(() => document.querySelector('input[type=checkbox][aria-hidden]')); // no-op
await o1.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.startsWith("Monday")); li.querySelector('input[type=checkbox]').click(); });
await o1.setv("#mon-from", "18:00"); await o1.setv("#mon-to", "09:00");
await o1.click("Save changes");
t("validation: closing before opening rejected", (await o1.text()).includes("closing time must be after opening"));
await o1.go(`/owner/business/${alpha.id}`);
await o1.setv("#summary", "Neighbourhood cafe serving filter coffee and toast.");
await o1.setv("#description", "We are a small independent cafe on a Hackney side street serving filter coffee, sourdough toast and weekend brunch to the neighbourhood since 2019 <b>no html</b>.");
await o1.setv("#phone", "020 7946 0111"); await o1.setv("#website", "alpha.example/menu"); await o1.setv("#instagram", "https://instagram.com/alphacafe");
await o1.setv("#services", "Coffee, Brunch, Catering"); await o1.setv("#founded", "2019");
await o1.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.startsWith("Monday")); if (!li.querySelector('input[type=checkbox]').checked) li.querySelector('input[type=checkbox]').click(); });
await o1.setv("#mon-from", "08:30"); await o1.setv("#mon-to", "16:00");
await o1.click("Save changes");
t("valid save reports change count", /Saved \d+ changes/.test(await o1.text()));
const aNew = await db.business.findUnique({ where: { id: alpha.id } });
t("DB updated: normalised website, hours JSON, services, owner timestamp", aNew.website === "https://alpha.example/menu" && JSON.parse(aNew.openingHours).mon === "08:30-16:00" && JSON.parse(aNew.services).length === 3 && !!aNew.ownerUpdatedAt && aNew.founded === 2019 && aNew.websiteHost === "alpha.example");
const log = await db.businessEditLog.findFirst({ where: { businessId: alpha.id }, orderBy: { createdAt: "desc" } });
const logc = JSON.parse(log.changes);
t("edit log records from/to per field", logc.summary.from === "An e2e ownership test business." && logc.summary.to.startsWith("Neighbourhood") && "phone" in logc);
await o1.click("Save changes");
t("saving unchanged = 'No changes'", (await o1.text()).includes("No changes"));
await anon.go(profilePath(alpha.slug));
const pub = await anon.text();
t("public profile reflects edits (escaped HTML, hours, phone, social, updated-by-owner)", pub.includes("Neighbourhood cafe serving filter coffee") && pub.includes("<b>no html</b>") && pub.includes("020 7946 0111") && pub.includes("08:30-16:00") && pub.includes("Instagram") && pub.includes("Profile updated by the business"));

// ===== 6. authorisation isolation =========================================
// owner 2 for Beta via the real phone-call-back verification path
await fillClaim(anon, beta.slug, { name: "Bea Beta", email: "bea@gmail.com" });
const claimB = await db.claimRequest.findFirst({ where: { businessId: beta.id } });
t("free-mail claimant: no domain match", claimB.domainMatch === false);
const tokB = await outboxLink("bea@gmail.com", /\/claim\/status\/([\w-]+)/);
await anon.go(`/claim/status/${tokB}`); await anon.click("Confirm my email");
await admin.go("/admin/claims");
t("Verified checkbox disabled without strong proof", await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("E2E Own Beta")); return li.querySelector('input[name="verified"]').disabled; }));
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("E2E Own Beta")); li.querySelector("form button").click(); }); await sleep(1800);
t("phone code issued once and shown to admin with the LISTED number", /Code \d{6}/.test(await admin.text()) && (await admin.text()).includes("020 7946 0200"));
const code = (await admin.text()).match(/Code (\d{6})/)[1];
await anon.go(`/claim/status/${tokB}`);
await anon.setv("#code", "000000"); await anon.click("Verify code");
t("wrong phone code rejected", (await anon.text()).includes("isn't right") && (await db.claimRequest.findUnique({ where: { id: claimB.id } })).phoneAttempts === 1);
await anon.go(`/claim/status/${tokB}`); await anon.setv("#code", code); await anon.click("Verify code");
t("right phone code verifies", (await db.claimRequest.findUnique({ where: { id: claimB.id } })).phoneVerifiedAt !== null);
await admin.go("/admin/claims");
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("E2E Own Beta")); li.querySelector('input[name="verified"]').click(); });
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("E2E Own Beta")); [...li.querySelectorAll("button")].find((b) => b.innerText.startsWith("Approve")).click(); }); await sleep(1800);
t("Beta approved VERIFIED via phone proof", (await db.business.findUnique({ where: { id: beta.id } })).claimStatus === "VERIFIED");
await loginAs(o2, "bea@gmail.com");
t("owner 2 signed in, sees only Beta", (await o2.text()).includes("E2E Own Beta") && !(await o2.text()).includes("E2E Own Alpha"));
for (const sub of ["", "/reviews", "/coverage"]) { await o1.go(`/owner/business/${beta.id}${sub}`); t(`owner 1 cannot open owner 2's business page (${sub || "profile"}) — 404`, (await o1.text()).includes("couldn't find") || (await o1.text()).includes("404")); }
// tampered form: hidden id swapped to the other business
await o1.go(`/owner/business/${alpha.id}`);
await o1.setv("#summary", "HIJACKED summary by another owner");
await o1.page.evaluate((id) => (document.querySelector('input[name="id"]').value = id), beta.id); // tamper LAST so React can't reset it
await o1.click("Save changes");
t("tampered id: other owner's profile NOT changed", (await db.business.findUnique({ where: { id: beta.id } })).summary === "Beta original summary text." && (await db.business.findUnique({ where: { id: alpha.id } })).summary !== "HIJACKED summary by another owner" && (await db.businessEditLog.count({ where: { businessId: beta.id } })) === 0);

// ===== 7. reviews: respond + report ========================================
const mkRev = (businessId, n, status = "PUBLISHED") => db.review.create({ data: { businessId, authorName: "Rev " + n, authorEmail: `rv${n}@x.com`, authorEmailHash: sha("rv" + n), rating: 4, body: "A decent visit, would go back again for the coffee.", status, bodyHash: "e2eown" + n, ipHash: "x" } });
const revA = await mkRev(alpha.id, 1), revPend = await mkRev(alpha.id, 2, "PENDING"), revB = await mkRev(beta.id, 3);
await o1.go(`/owner/business/${alpha.id}/reviews`);
t("owner sees published reviews only", (await o1.text()).includes("Rev 1") && !(await o1.text()).includes("Rev 2"));
await o1.setv(`#resp-${revA.id}`, "Thank you so much, see you again soon!"); await o1.click("Post response");
t("owner response saved", (await db.review.findUnique({ where: { id: revA.id } })).response?.startsWith("Thank you"));
await anon.go(profilePath(alpha.slug));
t("response shown publicly as from the business", (await anon.text()).includes("Response from E2E Own Alpha") && (await anon.text()).includes("see you again soon"));
// tamper: respond to the other business's review
await o1.go(`/owner/business/${alpha.id}/reviews`);
await o1.setv(`#resp-${revA.id}`, "Hijacked response on someone else's review");
await o1.page.evaluate((id) => (document.querySelector('input[name="reviewId"]').value = id), revB.id); // tamper LAST
await o1.click("Update response");
t("tampered reviewId: other business's review NOT answered", (await db.review.findUnique({ where: { id: revB.id } })).response === null);
await o1.go(`/owner/business/${alpha.id}/reviews`);
await o1.page.select(`#rr-${revA.id}`, "FAKE"); await o1.page.evaluate((id) => document.getElementById(`rr-${id}`).closest("details").open = true, revA.id);
await o1.page.evaluate((id) => [...document.getElementById(`rr-${id}`).closest("form").querySelectorAll("button")].find((b) => b.innerText.includes("Send report")).click(), revA.id); await sleep(1600);
const rep = await db.reviewReport.findFirst({ where: { reviewId: revA.id } });
t("owner report stored as OWNER type; review stays visible", rep?.reporterType === "OWNER" && (await db.review.findUnique({ where: { id: revA.id } })).status === "PUBLISHED");
await admin.go("/admin/reviews?tab=reported");
t("admin queue flags VERIFIED OWNER report", (await admin.text()).includes("VERIFIED OWNER"));
await o1.go(`/owner/business/${alpha.id}/reviews`);
await o1.click("Remove my response");
t("owner can remove own response", (await db.review.findUnique({ where: { id: revA.id } })).response === null);

// ===== 8. coverage + change requests =======================================
await o1.go(`/owner/business/${alpha.id}/coverage`);
await o1.setv("#topic", "Hi"); await o1.setv("#details", "short"); await o1.click("Send pitch");
t("coverage validation", (await o1.text()).includes("short headline") && (await o1.text()).includes("Tell us more"));
await o1.setv("#topic", "A Hackney cafe that roasts on site"); await o1.setv("#details", "We started roasting our own beans last spring after three years of buying them in, and now supply two other local cafes.");
await o1.click("Send pitch");
t("coverage pitch stored with 'not guaranteed / never for sale' wording", (await db.coverageRequest.count({ where: { businessId: alpha.id } })) === 1 && (await o1.text()).includes("never for sale"));
await o1.go(`/owner/business/${alpha.id}`);
await o1.setv("#message", "Please rename us to E2E Own Alpha Coffee Roasters"); await o1.click("Request change");
t("change request stored", (await db.profileChangeRequest.count({ where: { businessId: alpha.id } })) === 1);
await admin.go("/admin/owner-inbox");
t("admin inbox lists change request, pitch and the owner's edit", (await admin.text()).includes("Coffee Roasters") && (await admin.text()).includes("roasts on site") && (await admin.text()).includes("Neighbourhood cafe"));
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("roasts on site")); li.querySelector("select").value = "CONSIDERING"; li.querySelector('input[name="note"]').value = "Interesting — we'll be in touch"; [...li.querySelectorAll("button")].find((b) => b.innerText === "Save").click(); }); await sleep(1600);
await o1.go(`/owner/business/${alpha.id}/coverage`);
t("owner sees pitch status + note", (await o1.text()).includes("Under consideration") && (await o1.text()).includes("we'll be in touch"));
await admin.go("/admin/owner-inbox");
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Coffee Roasters")); li.querySelector('input[name="note"]').value = "Done."; [...li.querySelectorAll("button")].find((b) => b.innerText === "Done").click(); }); await sleep(1600);
t("change request resolved + owner emailed", (await db.profileChangeRequest.findFirst({ where: { businessId: alpha.id } })).status === "DONE" && (await db.emailOutbox.count({ where: { to: "ana@alpha.example", subject: { contains: "change request" } } })) === 1);
await admin.go("/admin/owner-inbox");
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Neighbourhood cafe") && l.innerText.includes("summary")); [...li.querySelectorAll("button")].find((b) => b.innerText.includes("Revert")).click(); }); await sleep(1800);
const rev = await db.business.findUnique({ where: { id: alpha.id } });
t("admin can revert an owner edit", rev.summary === "An e2e ownership test business." && rev.phone === "020 7946 0100" && (await db.businessEditLog.findUnique({ where: { id: log.id } })).revertedAt !== null);

// ===== 9. sessions ==========================================================
const o1b = await newPage(); await loginAs(o1b, "ana@alpha.example");
t("second device signed in", (await o1b.text()).includes("E2E Own Alpha"));
await o1.go("/owner"); await o1.click("Sign out everywhere");
await o1b.go("/owner");
t("'Sign out everywhere' invalidates the OTHER device's session", o1b.page.url().endsWith("/owner/login"));

// ===== 10. dispute + revoke ================================================
await anon.go(`/claim/dispute?business=${beta.slug}`);
await anon.setv("#name", "Sam Skeptic"); await anon.setv("#email", "sam@elsewhere.example"); await anon.setv("#role", "Former employee"); await anon.setv("#verification", "The person who claimed this left the company two years ago and has no authority.");
await anon.click("Send report");
t("dispute filed (no change to profile yet)", (await db.claimRequest.count({ where: { businessId: beta.id, kind: "DISPUTE" } })) === 1 && (await db.business.findUnique({ where: { id: beta.id } })).claimStatus === "VERIFIED");
await admin.go("/admin/claims");
t("admin sees Dispute tag + current owner", (await admin.text()).toUpperCase().includes("DISPUTE") && (await admin.text()).includes("bea@gmail.com"));
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Sam Skeptic")); li.querySelector('textarea[name="notes"]').value = "Confirmed with the company."; [...li.querySelectorAll("button")].find((b) => b.innerText.startsWith("Uphold")).click(); }); await sleep(1800);
await admin.go("/admin/claims?show=all");
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Sam Skeptic")); li.querySelector('input[name="reason"]').value = ""; [...li.querySelectorAll("button")].find((b) => b.innerText.startsWith("Revoke")).click(); }); await sleep(1500);
t("revoke requires a reason", (await admin.text()).includes("Give a reason") && (await db.businessOwner.count({ where: { businessId: beta.id } })) === 1);
await admin.go("/admin/claims?show=all");
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Sam Skeptic")); li.querySelector('input[name="reason"]').value = "Dispute upheld: former employee"; [...li.querySelectorAll("button")].find((b) => b.innerText.startsWith("Revoke")).click(); }); await sleep(1800);
t("ownership revoked: UNCLAIMED, owner link gone, owner emailed", (await db.business.findUnique({ where: { id: beta.id } })).claimStatus === "UNCLAIMED" && (await db.businessOwner.count({ where: { businessId: beta.id } })) === 0 && (await db.emailOutbox.count({ where: { to: "bea@gmail.com", subject: { contains: "access" } } })) === 1);
await o2.go(`/owner/business/${beta.id}`);
t("revoked owner loses access IMMEDIATELY (same live session)", (await o2.text()).includes("couldn't find") || (await o2.text()).includes("404"));
await o2.go("/owner");
t("…and dashboard shows no businesses", (await o2.text()).includes("don't manage any businesses"));

// ===== 11. competing claims, withdraw, needs-info =========================
await fillClaim(anon, gamma.slug, { name: "Cy One", email: "cy@gmail.com" });
await fillClaim(anon, gamma.slug, { name: "Dee Two", email: "dee@gmail.com" });
const tokC = await outboxLink("cy@gmail.com", /\/claim\/status\/([\w-]+)/), tokD = await outboxLink("dee@gmail.com", /\/claim\/status\/([\w-]+)/);
await anon.go(`/claim/status/${tokC}`); await anon.click("Confirm my email");
await admin.go("/admin/claims");
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Cy One")); li.querySelector('textarea[name="notes"]').value = "Please send your Companies House number"; [...li.querySelectorAll("button")].find((b) => b.innerText.startsWith("Request more")).click(); }); await sleep(1800);
await anon.go(`/claim/status/${tokC}`);
t("needs-info: claimant sees our note + can reply", (await anon.text()).includes("Companies House number") && (await anon.text()).includes("Send us the information"));
await anon.setv("#info", "Company number 01234567, director Cy One."); await anon.click("Send");
t("reply appended + status back to PENDING", await (async () => { const c = await db.claimRequest.findFirst({ where: { businessId: gamma.id, email: "cy@gmail.com" } }); return c.status === "PENDING" && c.verification.includes("01234567"); })());
await admin.go("/admin/claims");
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Cy One")); [...li.querySelectorAll("button")].find((b) => b.innerText.startsWith("Approve")).click(); }); await sleep(1800);
const dee = await db.claimRequest.findFirst({ where: { businessId: gamma.id, email: "dee@gmail.com" } });
t("approving one claim closes competing claims", (await db.business.findUnique({ where: { id: gamma.id } })).claimStatus === "CLAIMED" && dee.status === "REJECTED");
await anon.go(`/claim/status/${tokD}`);
t("rejected claimant sees closed status", (await anon.text()).includes("Not approved"));
// withdraw
await admin.go("/admin/businesses");
await db.business.update({ where: { id: gamma.id }, data: { claimStatus: "UNCLAIMED" } }); await db.businessOwner.deleteMany({ where: { businessId: gamma.id } });
await fillClaim(anon, gamma.slug, { name: "Wes Withdraw", email: "dee@gmail.com" });
const tokW = await outboxLink("dee@gmail.com", /\/claim\/status\/([\w-]+)/);
await anon.go(`/claim/status/${tokW}`); anon.page.once("dialog", (d) => d.accept()); await anon.click("Withdraw this request");
t("withdraw → claim closed and business back to UNCLAIMED", (await db.business.findUnique({ where: { id: gamma.id } })).claimStatus === "UNCLAIMED");
// rejection needs reason
await fillClaim(anon, gamma.slug, { name: "Rex Reject", email: "cy@gmail.com" });
await admin.go("/admin/claims");
await admin.page.evaluate(() => { const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Rex Reject")); [...li.querySelectorAll("button")].find((b) => b.innerText === "Reject").click(); }); await sleep(1500);
t("reject requires a reason", (await admin.text()).includes("Add a short reason"));

// ===== 12. misc ============================================================
t("owner & claim-status pages are noindex; robots blocks them", await (async () => { await o2.go("/owner/login"); const n = await o2.page.$eval('meta[name="robots"]', (e) => e.content); const r = await (await fetch(BASE + "/robots.txt")).text(); return n.includes("noindex") && r.includes("/owner") && r.includes("/claim/status"); })());
await admin.go(`/admin/businesses/${alpha.id}`);
await admin.page.evaluate(() => document.querySelector('input[name="ownedByFounder"]').click());
await admin.click("Save changes");
t("admin can flag founder-owned (deferred item done)", (await db.business.findUnique({ where: { id: alpha.id } })).ownedByFounder === true);

await cleanup(); await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL OWNER E2E PASSED"); process.exit(fail ? 1 : 0);
