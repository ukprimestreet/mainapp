// Search + discovery + newsletter end-to-end tests.
// The Next server must be started with POSTCODES_API_BASE=http://127.0.0.1:3999 (this script runs the mock on that port).
import http from "http";
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ENV = readFileSync(".env", "utf8");
const PW = ENV.match(/ADMIN_PASSWORD="(.*)"/)[1], ADMIN_EMAIL = ENV.match(/ADMIN_EMAIL="(.*)"/)[1], SECRET = ENV.match(/SESSION_SECRET="(.*)"/)[1];
const db = new PrismaClient();
let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HUMAN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ---- mock postcodes.io on :3999
const pcs = { "E8 3AA": [51.5450, -0.0553], "N1 9GU": [51.5340, -0.1200], "E8": [51.5450, -0.0600] };
const mock = http.createServer((req, res) => {
  const send = (c, b) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
  const m = req.url.match(/^\/(postcodes|outcodes)\/(.+)$/);
  if (req.method === "GET" && m) { const k = decodeURIComponent(m[2]); return pcs[k] ? send(200, { status: 200, result: { latitude: pcs[k][0], longitude: pcs[k][1] } }) : send(404, { status: 404 }); }
  if (req.method === "POST" && req.url === "/postcodes") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => send(200, { status: 200, result: JSON.parse(b).postcodes.map((p) => ({ query: p, result: pcs[p] ? { latitude: pcs[p][0], longitude: pcs[p][1] } : null })) })); return; }
  send(404, {});
});
await new Promise((r) => mock.listen(3999, "127.0.0.1", r));

const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
process.on("uncaughtException", async (e) => { console.log("CRASH", String(e).slice(0, 300)); try { await browser.close(); } catch {} process.exit(1); });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
await page.setUserAgent(HUMAN);
const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle0" });
const text = () => page.evaluate(() => document.body.innerText);
const setv = (sel, v) => page.$eval(sel, (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, v);
const click = async (label, scope) => { await page.evaluate((l, sc) => { const root = sc ? [...document.querySelectorAll("li,div,article,section,nav")].reverse().find((x) => x.innerText.toLowerCase().includes(sc.toLowerCase())) : document; const b = [...root.querySelectorAll("button,a")].find((x) => x.innerText.trim().split(String.fromCharCode(10))[0] === l); if (!b) throw new Error("no " + l); b.click(); }, label, scope); await sleep(1600); };
const status = async (p, o = {}) => (await fetch(BASE + p, { redirect: "manual", headers: { "user-agent": HUMAN }, ...o })).status;
const cookieVal = async (name) => decodeURIComponent((await page.cookies()).find((c) => c.name === name)?.value ?? "");
const robotsOf = async (p) => ((await (await fetch(BASE + p)).text()).match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? "");
const sha = (x) => createHash("sha256").update(x).digest("hex");
const outbox = (to, re) => db.emailOutbox.findMany({ where: { to }, orderBy: { createdAt: "desc" } }).then((m) => m.map((x) => x.body.match(re)?.[1]).find(Boolean));

const cleanup = async () => {
  await db.newsletterSubscriber.deleteMany({ where: { email: { endsWith: "@e2esearch.example" } } });
  await db.newsletterIssue.deleteMany({ where: { subject: { contains: "E2E digest" } } });
  await db.newsletterIssue.deleteMany({ where: { sentAt: { not: null }, subject: { startsWith: "PrimeStreet weekly:" } } });
  await db.newsletterIssue.deleteMany({ where: { sentAt: null } });
  await db.article.deleteMany({ where: { slug: { startsWith: "e2e-srch-" } } });
  await db.business.deleteMany({ where: { slug: { startsWith: "e2e-srch-" } } });
  await db.searchTerm.deleteMany(); await db.emailOutbox.deleteMany(); await db.auditLog.deleteMany({ where: { targetType: { in: ["Newsletter", "Search", "Business"] } } });
};
await cleanup();
const NL_IP = "198.51.100.77";
const ipKey = sha(`${SECRET}|${NL_IP}`).slice(0, 32);

// ================= page basics =================
await go("/search");
t("empty search page: suggested searches + near-me controls", (await text()).includes("Try searching for") && (await text()).includes("Use my location") && (await page.$("#postcode")) !== null);
t("search is noindex and disallowed in robots.txt", (await robotsOf("/search?q=x")).includes("noindex") && (await (await fetch(BASE + "/robots.txt")).text()).includes("Disallow: /search"));
t("header has Search + Saved links", await page.evaluate(() => !!document.querySelector('header a[aria-label="Search"]') && !!document.querySelector('header a[aria-label="Saved businesses"]')));
await go("/");
await page.type("#home-q", "cleaners"); await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
t("home hero search → /search?q=", page.url().includes("/search?q=cleaners") && (await text()).includes("Brightwell Cleaning Co"));

// ================= combobox =================
await go("/search");
await page.click("#search-main"); await page.type("#search-main", "clea");
await page.waitForSelector('[role="listbox"] [role="option"]', { timeout: 5000 });
t("combobox: listbox of options appears with ARIA roles", await page.evaluate(() => { const i = document.querySelector("#search-main"); return i.getAttribute("role") === "combobox" && i.getAttribute("aria-expanded") === "true" && document.querySelectorAll('[role="listbox"] [role="option"]').length >= 3 && i.getAttribute("aria-controls") === document.querySelector('[role="listbox"]').id; }));
await page.keyboard.press("ArrowDown");
t("combobox: ArrowDown highlights an option (aria-activedescendant + aria-selected)", await page.evaluate(() => { const i = document.querySelector("#search-main"); const id = i.getAttribute("aria-activedescendant"); return !!id && document.getElementById(id)?.getAttribute("aria-selected") === "true"; }));
await page.keyboard.press("Escape");
t("combobox: Escape closes the list", await page.evaluate(() => document.querySelector("#search-main").getAttribute("aria-expanded") === "false"));
await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter"); await page.waitForFunction(() => !location.pathname.startsWith("/search"), { timeout: 8000 }).catch(() => {});
t("combobox: Enter on a highlighted suggestion navigates to it", !page.url().includes("/search") && page.url().includes("/businesses/"));
await go("/search?q=zzzz"); await setv("#search-main", ""); await page.type("#search-main", "plumbing"); await page.waitForSelector('[role="option"]');
t("combobox: ‘See all results’ link present", (await text()).includes("See all results for “plumbing”"));

// ================= results, facets, typos =================
await go("/search?q=cleaning");
let tx = await text();
t("results: businesses ranked, counts shown, stories section present", tx.includes("Brightwell Cleaning Co") && /Businesses \(\d+\)/.test(tx) && tx.includes("Stories & guides"));
t("results: area/category chips link to listing pages", await page.evaluate(() => !!document.querySelector('a[href="/businesses/london/cleaning"]')));
t("facets: category counts visible", tx.includes("Cleaning") && tx.includes("Filter"));
await click("Hackney", "Area"); // click a facet link (area)
t("facet click filters results and keeps the query in the URL", page.url().includes("area=hackney") && page.url().includes("q=cleaning"));
await click("Clear all filters");
t("clear all filters", !page.url().includes("area="));
await go("/search?q=cleaning&sort=rating");
t("sort links work and mark the current sort", await page.evaluate(() => document.querySelector('nav[aria-label="Sort"] a[aria-current="true"]')?.innerText === "Top rated"));
await go("/search?q=claening");
t("typo: 'Did you mean cleaning?' shown", (await text()).includes("Did you mean") && (await text()).includes("cleaning"));
await click("cleaning", "Did you mean");
t("clicking the suggestion searches the corrected word", page.url().includes("q=cleaning") && (await text()).includes("Brightwell Cleaning Co"));
await go("/search?q=removal");
t("synonyms: 'removal' finds removals companies", (await text()).includes("Thames Haul Removals"));
await go("/search?q=zzzqqq");
t("no results: helpful empty state", (await text()).includes("No businesses found") && (await text()).includes("Suggest a business"));
await go("/search?q=" + encodeURIComponent('NEAR("a" b) OR * " -x'));
t("hostile query: page renders normally", (await text()).includes("Results for"));
await go("/search?q=" + encodeURIComponent("<script>window.__x=1</script>"));
t("XSS in query is escaped", await page.evaluate(() => !window.__x && document.body.innerText.includes("<script>")));
await go("/businesses?q=cleaners");
t("/businesses uses the same engine (stemming/synonyms): 'cleaners' finds cleaning companies", (await text()).includes("Brightwell Cleaning Co") && (await text()).includes("Lea Valley Maids") === true);
await go("/businesses?q=plumbng");
t("/businesses: typo suggestion", (await text()).includes("Did you mean"));

// ================= near me =================
await go("/search?postcode=E8%203AA");
tx = await text();
t("near me (postcode via mock API): results sorted nearest with distances", tx.includes("near E8 3AA") && /\d+(\.\d)? km away|\d+ m away/.test(tx) && await page.evaluate(() => document.querySelector('nav[aria-label="Sort"] a[aria-current="true"]')?.innerText === "Nearest"));
const dists = await page.$$eval("article", (a) => a.map((x) => x.innerText.match(/≈? ?([\d.]+) (km|m) away/)).filter(Boolean).map((m) => (m[2] === "m" ? Number(m[1]) / 1000 : Number(m[1]))));
t("near me: distances ascend", dists.length > 3 && dists.every((d, i) => i === 0 || d >= dists[i - 1] - 1e-9), JSON.stringify(dists.slice(0, 6)));
t("near me: businesses without coordinates are marked approximate (≈)", (await text()).includes("≈"));
await go("/search?postcode=ZZ1%201ZZ");
t("unknown postcode: clear error, no crash", (await text()).includes("couldn't find the postcode"));
await go("/search?near=51.545,-0.055&q=cleaning");
t("near by coordinates + query", (await text()).includes("near your location"));
await go("/search?near=0,0"); t("coordinates outside the UK are ignored", !(await text()).includes("near your location"));
await go("/search?near=abc"); t("garbage coordinates are ignored", !(await text()).includes("near your location"));
// browser geolocation
await browser.defaultBrowserContext().overridePermissions(BASE, ["geolocation"]);
await page.setGeolocation({ latitude: 51.5465123, longitude: -0.1058456, accuracy: 50 });
await go("/search");
await click("Use my location");
await page.waitForFunction(() => location.search.includes("near="), { timeout: 8000 }).catch(() => {});
t("'Use my location' → coordinates rounded to ~100 m in the URL, nearest sort", /near=51\.547,-0\.106|near=51\.546,-0\.106/.test(decodeURIComponent(page.url())) && page.url().includes("sort=nearest"), page.url());
t("near-me: no location stored anywhere (no cookies)", !(await page.cookies()).some((c) => /near|geo|lat|lng/i.test(c.name)));
await browser.defaultBrowserContext().clearPermissionOverrides();

// ================= saved + recently viewed + recommendations =================
await page.deleteCookie(...(await page.cookies()).filter((c) => c.name.startsWith("ps_")));
await go("/saved");
t("saved: empty state explains cookies/no account", (await text()).includes("Nothing saved yet") && (await text()).includes("cookie"));
await go("/businesses/london/cleaning/brightwell-cleaning-co");
t("profile: Save button (aria-pressed=false) + Similar businesses", await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label")?.startsWith("Save Brightwell")); return b?.getAttribute("aria-pressed") === "false"; }) && (await text()).includes("Similar businesses"));
const sims = await page.evaluate(() => { const h = [...document.querySelectorAll("h2")].find((x) => x.innerText.includes("Similar businesses")); return [...h.parentElement.parentElement.querySelectorAll("h3")].map((x) => x.innerText); });
t("similar businesses: same-category businesses lead the list, never itself", sims.length >= 3 && !sims.includes("Brightwell Cleaning Co") && ["Lea Valley Maids", "Crown & Anchor Cleaners", "Spotless Southwark"].filter((n) => sims.slice(0, 4).includes(n)).length >= 2, JSON.stringify(sims));
await page.click('button[aria-label^="Save Brightwell"]'); await sleep(400);
t("save: button toggles to pressed + cookie holds the id", await page.evaluate(() => document.querySelector('button[aria-label^="Remove Brightwell"]')?.getAttribute("aria-pressed") === "true") && /^[a-z0-9]{20,}$/.test(await cookieVal("ps_saved")));
const savedCookie = (await page.cookies()).find((c) => c.name === "ps_saved");
t("saved cookie is first-party functional: Lax, 1 year, not httpOnly (client-managed)", savedCookie.sameSite === "Lax" && savedCookie.expires > Date.now() / 1000 + 300 * 86400 && !savedCookie.httpOnly);
t("recently viewed cookie recorded", /^[a-z0-9]{20,}/.test(await cookieVal("ps_recent")));
await go("/businesses/london/cafes/kiln-and-ember"); await sleep(400);
await go("/saved");
tx = await text();
t("saved page lists the saved business", tx.includes("Saved (1)") && tx.includes("Brightwell Cleaning Co"));
t("recommendations: 'You might like — because you saved Brightwell…' excludes the saved item", tx.includes("You might like") && tx.includes("you saved Brightwell Cleaning Co") && await page.evaluate(() => { const s = document.querySelector('section[aria-labelledby="recs"]'); const cards = [...s.querySelectorAll("article")]; return cards.length >= 2 && cards.every((a) => !a.innerText.includes("Brightwell Cleaning Co")); }));
t("recently viewed section shows the other profile visited", tx.includes("Recently viewed") && await page.evaluate(() => document.querySelector('section[aria-labelledby="recent"]')?.innerText.includes("Kiln & Ember")));
await go("/");
t("home: 'Picked for you' uses the visitor's own cookies", (await text()).includes("Picked for you"));
await go("/saved");
await page.click('button[aria-label^="Remove Brightwell"]'); await sleep(1500);
t("un-saving from the list refreshes it (list empties)", (await text()).includes("Nothing saved yet") && (await cookieVal("ps_saved")) === "");
// cookie tampering
await page.setCookie({ name: "ps_saved", value: encodeURIComponent("'; DROP TABLE Business;--,../../etc,<script>," + "x".repeat(60)), url: BASE });
await page.setCookie({ name: "ps_recent", value: "%E0%A4%A", url: BASE });
await go("/saved"); t("…and render the empty state", (await text()).includes("Nothing saved yet"));
await page.deleteCookie(...(await page.cookies()).filter((c) => c.name.startsWith("ps_")));
t("saved/recent pages are noindex", (await robotsOf("/saved")).includes("noindex"));

// ================= newsletter =================
await page.setExtraHTTPHeaders({ "x-forwarded-for": NL_IP });
await go("/");
t("footer newsletter form + privacy link", await page.evaluate(() => !!document.querySelector("footer form input[name=email]") && !!document.querySelector('footer a[href="/privacy"]')));
await page.type("footer #nl-footer", "not-an-email"); await sleep(1800); await click("Subscribe");
t("newsletter: invalid email refused", (await text()).includes("valid email"));
await go("/"); await page.type("footer #nl-footer", "fast@e2esearch.example"); await click("Subscribe");
t("newsletter: instant (bot-speed) submit refused", (await text()).includes("That was quick") && (await db.newsletterSubscriber.count({ where: { email: "fast@e2esearch.example" } })) === 0);
await go("/"); await page.type("footer #nl-footer", "mal@mailinator.com"); await sleep(1800); await click("Subscribe");
t("newsletter: disposable address refused", (await text()).includes("permanent email") && (await db.newsletterSubscriber.count({ where: { email: "mal@mailinator.com" } })) === 0);
await go("/"); await page.$eval('footer input[name="fax_number"]', (e) => (e.value = "x")); await page.type("footer #nl-footer", "honey@e2esearch.example"); await sleep(1800); await click("Subscribe");
t("newsletter: honeypot looks successful but stores nothing", (await text()).toLowerCase().includes("check your email") && (await db.newsletterSubscriber.count({ where: { email: "honey@e2esearch.example" } })) === 0);
await go("/"); await page.type("footer #nl-footer", "Sub1@E2ESearch.example"); await sleep(1800); await click("Subscribe");
let sub = await db.newsletterSubscriber.findUnique({ where: { email: "sub1@e2esearch.example" } });
t("newsletter: valid signup → PENDING (lower-cased), tells you to confirm, source recorded", (await text()).includes("check your email") && sub?.status === "PENDING" && sub.source === "footer" && sub.confirmHash.length === 64);
const ctok = await outbox("sub1@e2esearch.example", /\/newsletter\/confirm\/([\w-]+)/);
t("confirmation email recorded with a link (token stored hashed)", !!ctok && sub.confirmHash !== ctok);
await go(`/newsletter/confirm/${ctok}`); await go(`/newsletter/confirm/${ctok}`);
t("opening the confirm link does NOT subscribe (prefetch-safe)", (await db.newsletterSubscriber.findUnique({ where: { email: "sub1@e2esearch.example" } })).status === "PENDING");
await click("Confirm subscription");
sub = await db.newsletterSubscriber.findUnique({ where: { email: "sub1@e2esearch.example" } });
t("confirm button → ACTIVE", sub.status === "ACTIVE" && !!sub.confirmedAt && (await text()).includes("You're subscribed"));
await go("/newsletter/confirm/garbage"); await click("Confirm subscription"); t("bad confirm token refused", (await text()).includes("isn't valid"));
const mails = await db.emailOutbox.count({ where: { to: "sub1@e2esearch.example" } });
await go("/"); await page.type("footer #nl-footer", "sub1@e2esearch.example"); await sleep(1800); await click("Subscribe");
t("re-subscribing an ACTIVE address: same message, no extra email (no enumeration/spam)", (await text()).includes("check your email") && (await db.emailOutbox.count({ where: { to: "sub1@e2esearch.example" } })) === mails && (await db.newsletterSubscriber.findUnique({ where: { email: "sub1@e2esearch.example" } })).status === "ACTIVE");
for (let i = 0; i < 5; i++) await db.newsletterSubscriber.create({ data: { email: `rl${i}@e2esearch.example`, status: "PENDING", ipHash: ipKey } });
await go("/"); await page.type("footer #nl-footer", "toomany@e2esearch.example"); await sleep(1800); await click("Subscribe");
t("newsletter: per-IP hourly limit enforced", (await text()).includes("Too many sign-ups") && (await db.newsletterSubscriber.count({ where: { email: "toomany@e2esearch.example" } })) === 0);
await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: "rl" } } });

// ---- admin newsletter
t("admin newsletter + export require login", [302, 307, 308].includes(await status("/admin/newsletter")) && (await status("/admin/newsletter/export")) === 401);
await go("/admin/login"); await page.type("#email", ADMIN_EMAIL); await page.type("#password", PW);
await Promise.all([page.click('form:has(#password) button'), page.waitForFunction(() => location.pathname === "/admin")]);
await go("/admin/newsletter");
t("admin: subscriber counts", (await text()).includes("Active subscribers") && (await text()).includes("sub1@e2esearch.example"));
await db.article.updateMany({ where: { isSample: false, publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) } }, data: { publishedAt: new Date(Date.now() - 20 * 86400_000) } });
await click("+ Build this week's digest");
t("digest: nothing real & new → clear message, no empty draft", (await text()).includes("Nothing new") && (await db.newsletterIssue.count()) === 0);
const author = await db.author.findFirst(); const city = await db.city.findFirst(); const loc = await db.location.findUnique({ where: { slug: "hackney" } }); const cat = await db.category.findUnique({ where: { slug: "cafes" } });
await db.article.create({ data: { slug: "e2e-srch-news", type: "NEWS", title: "E2E digest: a bakery opens in Hackney", standfirst: "A new bakery has opened its doors on a Hackney side street this week.", body: "b".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - 3600_000), authorId: author.id, isSample: false } });
await db.business.create({ data: { slug: "e2e-srch-biz", name: "E2E Srch New Bakery", summary: "A bakery for the digest.", description: "d".repeat(80), cityId: city.id, locationId: loc.id, categoryId: cat.id, isSample: false } });
await go("/admin/newsletter"); await click("+ Build this week's digest");
const issue = await db.newsletterIssue.findFirst();
t("digest built from real content: stories + new businesses, unsubscribe placeholder, no sample data", !!issue && issue.body.includes("E2E digest: a bakery opens in Hackney") && issue.body.includes("E2E Srch New Bakery") && issue.body.includes("{{unsubscribe}}") && !issue.body.includes("a-wood-fired"));
await setv("#body", "No unsubscribe placeholder here, just text that is long enough to pass the length check okay."); await click("Save draft");
t("saving without {{unsubscribe}} is refused", (await text()).includes("must contain {{unsubscribe}}"));
await go(`/admin/newsletter/${issue.id}`); await setv("#subject", "E2E digest subject"); await click("Save draft");
t("subject edit saved", (await db.newsletterIssue.findUnique({ where: { id: issue.id } })).subject === "E2E digest subject");
await click("Send test");
t("test send goes to the admin only", (await db.emailOutbox.count({ where: { to: ADMIN_EMAIL, subject: "[TEST] E2E digest subject" } })) === 1 && (await db.emailOutbox.count({ where: { to: "sub1@e2esearch.example", subject: "E2E digest subject" } })) === 0);
await click("Send now");
t("send requires the confirmation tick", (await text()).includes("Tick the confirmation") && !(await db.newsletterIssue.findUnique({ where: { id: issue.id } })).sentAt);
await go(`/admin/newsletter/${issue.id}`); await page.click('input[name="confirm"]'); await click("Send now");
const sent = await db.newsletterIssue.findUnique({ where: { id: issue.id } });
const active = await db.newsletterSubscriber.count({ where: { status: "ACTIVE" } });
t("sent to every ACTIVE subscriber (not pending)", !!sent.sentAt && sent.recipients === active && (await db.emailOutbox.count({ where: { to: "sub1@e2esearch.example", subject: "E2E digest subject" } })) === 1);
const mail = await db.emailOutbox.findFirst({ where: { to: "sub1@e2esearch.example", subject: "E2E digest subject" } });
const utok = mail.body.match(/\/newsletter\/unsubscribe\/([\w.-]+)/)?.[1];
t("each email carries a personal one-click unsubscribe link + sender footer", !!utok && mail.body.includes("Unsubscribe in one click") && !mail.body.includes("{{unsubscribe}}"));
await go(`/admin/newsletter/${issue.id}`);
t("sent issue is locked (no edit/send buttons)", (await text()).includes("Sent to") && (await page.$('button[name="x"]')) === null && !(await text()).includes("Send now"));
await go(`/newsletter/unsubscribe/${utok}`);
t("unsubscribe page does not act on GET", (await db.newsletterSubscriber.findUnique({ where: { email: "sub1@e2esearch.example" } })).status === "ACTIVE");
await click("Yes, unsubscribe me");
t("unsubscribe button → UNSUBSCRIBED", (await db.newsletterSubscriber.findUnique({ where: { email: "sub1@e2esearch.example" } })).status === "UNSUBSCRIBED" && (await text()).includes("unsubscribed"));
await db.newsletterSubscriber.update({ where: { email: "sub1@e2esearch.example" }, data: { status: "ACTIVE" } });
const one = await fetch(`${BASE}/api/newsletter/unsubscribe/${utok}`, { method: "POST" });
t("RFC 8058 one-click POST endpoint unsubscribes", one.status === 200 && (await db.newsletterSubscriber.findUnique({ where: { email: "sub1@e2esearch.example" } })).status === "UNSUBSCRIBED");
t("one-click endpoint rejects bad tokens and GET", (await fetch(`${BASE}/api/newsletter/unsubscribe/bad.token`, { method: "POST" })).status === 400 && (await fetch(`${BASE}/api/newsletter/unsubscribe/${utok}`)).status === 405);
await go("/"); await page.type("footer #nl-footer", "sub1@e2esearch.example"); await sleep(1800); await click("Subscribe");
t("an unsubscribed address can re-subscribe (goes back to PENDING + new confirmation)", (await db.newsletterSubscriber.findUnique({ where: { email: "sub1@e2esearch.example" } })).status === "PENDING");
await db.newsletterSubscriber.create({ data: { email: "csv@e2esearch.example", status: "ACTIVE", confirmedAt: new Date(), source: "=HYPERLINK(\"http://evil\")" } });
const cookie = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const csv = await (await fetch(`${BASE}/admin/newsletter/export`, { headers: { cookie } })).text();
t("CSV export: active only, formula injection neutralised", csv.startsWith("email,confirmed_at,source") && csv.includes("csv@e2esearch.example") && !csv.includes("sub1@e2esearch.example") && csv.includes("\"'=HYPERLINK") );

// ================= admin search tools =================
await go("/search?q=barber"); await go("/search?q=nonexistentthing"); await go("/search?q=nonexistentthing");
await go("/admin/search");
tx = await text();
t("admin search: index counts, top searches and zero-result list", tx.includes("Indexed businesses") && tx.includes("Top searches") && tx.includes("barber") && tx.includes("Searches with no results") && tx.includes("nonexistentthing"));
await click("Rebuild search index");
await page.waitForFunction(() => document.body.innerText.includes("Rebuilt the search index"), { timeout: 40000 }).catch(() => {});
t("rebuild index works", (await text()).includes("Rebuilt the search index"));
await db.business.create({ data: { slug: "e2e-srch-geo", name: "E2E Srch Geo Cafe", summary: "Cafe for the geocoding test.", description: "d".repeat(80), cityId: city.id, locationId: loc.id, categoryId: cat.id, isSample: false, postcode: "E8 3AA" } });
await go("/admin/search");
t("geocode button shows pending count", (await text()).includes("Geocode postcodes (1 of 1 pending)") || /Geocode postcodes \(\d+ of \d+ pending\)/.test(await text()));
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.startsWith("Geocode postcodes")).click()); await sleep(1800);
const geo = await db.business.findUnique({ where: { slug: "e2e-srch-geo" } });
t("geocoding fills coordinates from the postcode service", Math.abs(geo.lat - 51.545) < 1e-6 && geo.geoSource === "POSTCODE");
await go(`/admin/businesses/${geo.id}`); await setv("#postcode", "N1 9GU"); await click("Save changes");
t("changing a postcode re-geocodes automatically", Math.abs((await db.business.findUnique({ where: { id: geo.id } })).lat - 51.534) < 1e-6);
await setv("#postcode", ""); await page.evaluate(() => (document.querySelector("#postcode").value = "")); await go(`/admin/businesses/${geo.id}`); await setv("#postcode", "ZZ1 1ZZ"); await click("Save changes");
t("an unusable postcode clears stale coordinates", (await db.business.findUnique({ where: { id: geo.id } })).lat === null);
await go("/search?q=e2e+srch+geo+cafe");
t("new business is searchable within seconds of creation", (await text()).includes("E2E Srch Geo Cafe"));

// ================= misc =================
await go("/privacy");
t("privacy page content", await (async () => { const x = await text(); return ["Reviews:", "Newsletter:", "ps_saved", "Use my location", "Information Commissioner"].every((w) => x.includes(w)); })());
t("privacy is in the sitemap", await (async () => { const idx = await (await fetch(BASE + "/sitemap.xml")).text(); let all = ""; for (const m of idx.matchAll(/<loc>([^<]+)<\/loc>/g)) all += await (await fetch(BASE + new URL(m[1]).pathname)).text(); return all.includes("/privacy"); })());

await cleanup(); mock.close(); await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL SEARCH E2E PASSED"); process.exit(fail ? 1 : 0);
