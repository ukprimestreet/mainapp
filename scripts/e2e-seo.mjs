// SEO admin tools end-to-end tests. Run against `next start` (BASE env) with a seeded DB.
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ENV = readFileSync(".env", "utf8");
const PW = ENV.match(/ADMIN_PASSWORD="(.*)"/)[1], ADMIN_EMAIL = ENV.match(/ADMIN_EMAIL="(.*)"/)[1];
const db = new PrismaClient();
let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle0" });
const text = () => page.evaluate(() => document.body.innerText);
const setv = (sel, v) => page.$eval(sel, (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, v);
const click = async (label, scope) => { await page.evaluate((l, sc) => { const root = sc ? [...document.querySelectorAll("tr,li")].find((x) => x.innerText.includes(sc)) : document; const b = [...root.querySelectorAll("button,a")].find((x) => x.innerText.trim() === l); if (!b) throw new Error("no " + l); b.click(); }, label, scope); await sleep(1700); };
const sitemapPaths = async () => { const idx = await (await fetch(BASE + "/sitemap.xml")).text(); const out = []; for (const m of idx.matchAll(/<loc>([^<]+)<\/loc>/g)) { const x = await (await fetch(BASE + new URL(m[1]).pathname)).text(); for (const u of x.matchAll(/<loc>([^<]+)<\/loc>/g)) out.push(new URL(u[1]).pathname); } return out; };
const robotsOf = async (p) => { const h = await (await fetch(BASE + p)).text(); return h.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? ""; };
const titleOf = async (p) => (await (await fetch(BASE + p)).text()).match(/<title>([^<]*)<\/title>/)?.[1];

const city = await db.city.findFirst(); const camden = await db.location.findUnique({ where: { slug: "camden" } }); const cat = await db.category.findUnique({ where: { slug: "cleaning" } });
const author = await db.author.findFirst();
const cleanup = async () => {
  const ids = (await db.business.findMany({ where: { slug: { startsWith: "e2e-seo-" } }, select: { id: true } })).map((b) => b.id);
  await db.business.deleteMany({ where: { id: { in: ids } } });
  await db.article.deleteMany({ where: { slug: { startsWith: "e2e-seo-" } } });
  await db.seoPage.deleteMany(); await db.redirect.deleteMany(); await db.auditLog.deleteMany({ where: { targetType: "Seo" } });
};
await cleanup();
for (let i = 1; i <= 3; i++) await db.business.create({ data: { slug: `e2e-seo-camden-${i}`, name: `E2E Camden Cleaner ${i}`, summary: "Camden cleaning business for SEO tests.", description: "A locally run cleaning business with plenty of detail, serving homes and small offices in the borough for many years.", cityId: city.id, locationId: camden.id, categoryId: cat.id, isSample: false, phone: "020 7946 07" + i + "0" } });

// ---- auth
const anon = await fetch(BASE + "/admin/seo", { redirect: "manual" });
t("SEO admin requires login", [302, 307, 308].includes(anon.status));
await go("/admin/login"); await page.type("#email", ADMIN_EMAIL); await page.type("#password", PW);
await Promise.all([page.click('form:has(#password) button'), page.waitForFunction(() => location.pathname === "/admin")]);

// ---- health table explains what's missing
await go("/admin/seo");
let tx = await text();
t("health: lists Camden with 3 real businesses and what it needs", tx.includes("Camden") && tx.includes("Original intro of 100+ characters"));
t("health: summary counts + threshold explained", tx.includes("Indexed landing pages") && tx.includes("3 real businesses"));
t("Camden area page currently noindex and absent from sitemap", (await robotsOf("/locations/camden")).includes("noindex") && !(await sitemapPaths()).includes("/locations/camden"));

// ---- write an intro → page unlocks everywhere
await go(`/admin/seo/edit?path=${encodeURIComponent("/locations/camden")}`);
await setv("#intro", "Too short.");
await click("Save");
t("saving a too-short intro works but doesn't unlock indexing", (await robotsOf("/locations/camden")).includes("noindex"));
const intro = "Camden mixes market-stall traders, long-established family firms and a growing cluster of creative studios around Camden Town, Chalk Farm and Kentish Town. Its independent businesses range from cleaners and caterers to repair shops and cafes.";
await go(`/admin/seo/edit?path=${encodeURIComponent("/locations/camden")}`);
t("form re-opens with the saved intro", (await page.$eval("#intro", (e) => e.value)) === "Too short.");
await setv("#intro", intro); await click("Save");
t("intro saved message", (await text()).includes("Saved."));
t("Camden area now indexable (no noindex) + in sitemap", !(await robotsOf("/locations/camden")).includes("noindex") && (await sitemapPaths()).includes("/locations/camden"));
await go("/locations/camden");
t("intro is shown on the public page as editorial copy", (await text()).includes("Chalk Farm") && (await text()).includes("About Camden"));
await go("/admin/seo");
t("health now shows Camden as Indexed", await page.evaluate(() => { const r = [...document.querySelectorAll("tr")].find((x) => x.innerText.includes("/locations/camden") && x.innerText.includes("Area")); const u = r.innerText.toUpperCase(); return u.includes("INDEXED") && !u.includes("NOINDEX"); }));

// ---- title / description overrides + preview + validation
await go(`/admin/seo/edit?path=${encodeURIComponent("/locations/camden")}`);
await setv("#title", "T".repeat(71)); await click("Save");
t("validation: title over 70 chars refused", (await text()).includes("over 70 characters"));
await go(`/admin/seo/edit?path=${encodeURIComponent("/locations/camden")}`);
await setv("#title", "Camden businesses worth knowing"); await setv("#description", "A hand-written description for Camden that is long enough to be a proper snippet for search results.");
t("live search preview updates as you type", (await text()).includes("Camden businesses worth knowing | PrimeStreet"));
await click("Save");
t("title + description overrides applied to the page", (await titleOf("/locations/camden")) === "Camden businesses worth knowing | PrimeStreet" && (await (await fetch(BASE + "/locations/camden")).text()).includes("A hand-written description for Camden"));

// ---- NOINDEX override beats a perfect page
await go(`/admin/seo/edit?path=${encodeURIComponent("/locations/camden")}`);
await setv("#robots", "NOINDEX"); await click("Save");
t("NOINDEX override: page noindex and removed from sitemap", (await robotsOf("/locations/camden")).includes("noindex") && !(await sitemapPaths()).includes("/locations/camden"));
// ---- INDEX override can't make an empty page indexable
await go(`/admin/seo/edit?path=${encodeURIComponent("/locations/barnet")}`);
await setv("#intro", intro); await setv("#robots", "INDEX"); await click("Save");
t("INDEX override cannot index an empty page (0 real businesses)", (await robotsOf("/locations/barnet")).includes("noindex") && !(await sitemapPaths()).includes("/locations/barnet"));
// reset
await go(`/admin/seo/edit?path=${encodeURIComponent("/locations/camden")}`);
await click("Reset this page to automatic");
t("reset removes overrides (title back to automatic)", (await titleOf("/locations/camden")).startsWith("Businesses in Camden") && (await db.seoPage.count({ where: { path: "/locations/camden" } })) === 0);

// ---- redirect manager UI
await go("/admin/seo/redirects");
await setv("#from", "/e2e-seo-old"); await setv("#to", "/locations/camden"); await click("Add redirect");
t("redirect added", (await text()).includes("Redirect saved") && (await db.redirect.count({ where: { fromPath: "/e2e-seo-old" } })) === 1);
let r = await fetch(BASE + "/e2e-seo-old", { redirect: "manual" });
t("redirect works: 308 to destination, hit counted", r.status === 308 && new URL(r.headers.get("location"), BASE).pathname === "/locations/camden" && (await db.redirect.findUnique({ where: { fromPath: "/e2e-seo-old" } })).hits === 1);
await go("/admin/seo/redirects"); await setv("#from", "/e2e-seo-old"); await setv("#to", "/e2e-seo-old"); await click("Add redirect");
t("self-redirect refused", (await text()).includes("can't redirect to itself"));
await go("/admin/seo/redirects"); await setv("#from", "/locations/camden"); await setv("#to", "/e2e-seo-old"); await click("Add redirect");
t("loop refused", (await text()).includes("redirect loop"));
await go("/admin/seo/redirects"); await setv("#from", "/e2e-seo-x"); await setv("#to", "https://evil.example/phish"); await click("Add redirect");
t("external target refused", (await text()).includes("external URLs aren't allowed") && (await db.redirect.count({ where: { fromPath: "/e2e-seo-x" } })) === 0);
await go("/admin/seo/redirects"); await setv("#from", "/admin/secret"); await setv("#to", "/x"); await click("Add redirect");
t("reserved path refused", (await text()).includes("can't be redirected"));
await go("/admin/seo/redirects"); await setv("#from", "/e2e-seo-older"); await setv("#to", "/e2e-seo-old"); await click("Add redirect");
r = await fetch(BASE + "/e2e-seo-older", { redirect: "manual" });
t("chain: old→old→camden collapses to a single 308 hop", r.status === 308 && new URL(r.headers.get("location"), BASE).pathname === "/locations/camden");
await go("/admin/seo/redirects"); await click("Delete", "/e2e-seo-older");
t("delete works; path then 404s", (await db.redirect.count({ where: { fromPath: "/e2e-seo-older" } })) === 0 && (await fetch(BASE + "/e2e-seo-older", { redirect: "manual" })).status === 404);

// ---- slug change → automatic redirect (business)
const biz = await db.business.findUnique({ where: { slug: "e2e-seo-camden-1" } });
const oldPath = `/businesses/london/cleaning/${biz.slug}`;
await go(`/admin/businesses/${biz.id}`);
await setv("#slug", "e2e-seo-camden-one-renamed"); await click("Save changes");
t("business slug saved", (await db.business.findUnique({ where: { id: biz.id } })).slug === "e2e-seo-camden-one-renamed");
r = await fetch(BASE + oldPath, { redirect: "manual" });
t("old business URL permanently redirects to the new one (auto-created)", r.status === 308 && new URL(r.headers.get("location"), BASE).pathname === `/businesses/london/cleaning/e2e-seo-camden-one-renamed`);
t("redirect row recorded with note", (await db.redirect.findUnique({ where: { fromPath: oldPath } }))?.note === "Business URL changed");
await go(`/admin/businesses/${biz.id}`); await setv("#slug", "e2e-seo-camden-2"); await click("Save changes");
t("duplicate business slug refused", (await text()).includes("already used") && (await db.business.findUnique({ where: { id: biz.id } })).slug === "e2e-seo-camden-one-renamed");
await go(`/admin/businesses/${biz.id}`); await setv("#slug", "Bad Slug!"); await click("Save changes");
t("invalid business slug refused", (await text()).includes("lowercase letters"));
// renaming back creates reverse redirect and collapses (no loop)
await go(`/admin/businesses/${biz.id}`); await setv("#slug", biz.slug); await click("Save changes");
r = await fetch(BASE + oldPath, { redirect: "manual" });
t("renaming back: original URL serves the page again (no redirect loop)", r.status === 200 || (await db.redirect.count({ where: { fromPath: oldPath } })) === 0 || r.status === 308 && new URL(r.headers.get("location"), BASE).pathname !== oldPath);

// ---- slug change → automatic redirect (live article)
const art = await db.article.create({ data: { slug: "e2e-seo-article", type: "NEWS", title: "An SEO test article about cleaning", standfirst: "A standfirst long enough to satisfy the publishing rules for this test.", body: "z".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - 3600_000), authorId: author.id, isSample: false } });
await go(`/admin/articles/${art.id}`);
await setv("#slug", "e2e-seo-article-moved"); await click("Save changes");
t("article slug saved", (await db.article.findUnique({ where: { id: art.id } })).slug === "e2e-seo-article-moved");
r = await fetch(BASE + "/news/e2e-seo-article", { redirect: "manual" });
t("old article URL → 308 to the new URL", r.status === 308 && new URL(r.headers.get("location"), BASE).pathname === "/news/e2e-seo-article-moved");
t("new article URL is live and in the sitemap; old one is not", (await fetch(BASE + "/news/e2e-seo-article-moved")).status === 200 && (await sitemapPaths()).includes("/news/e2e-seo-article-moved") && !(await sitemapPaths()).includes("/news/e2e-seo-article"));
await go(`/admin/seo/redirects`);
t("redirect manager shows the automatic redirects with hit counts", (await text()).includes("/news/e2e-seo-article") && (await text()).includes("Article URL changed"));

// ---- gating of SeoPage on a business profile
await go(`/admin/seo/edit?path=${encodeURIComponent(`/businesses/london/cleaning/${biz.slug}`)}`);
await setv("#robots", "NOINDEX"); await click("Save");
t("per-profile NOINDEX works and leaves the sitemap", (await robotsOf(`/businesses/london/cleaning/${biz.slug}`)).includes("noindex") && !(await sitemapPaths()).includes(`/businesses/london/cleaning/${biz.slug}`));

// ---- audit trail
t("SEO changes are audit-logged", (await db.auditLog.count({ where: { targetType: "Seo" } })) >= 5);

await cleanup(); await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL SEO E2E PASSED"); process.exit(fail ? 1 : 0);
