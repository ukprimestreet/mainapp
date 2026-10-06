// Editorial CMS end-to-end tests. Run against `next start -p 3417` with a seeded DB.
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3417";
const PW = readFileSync(".env", "utf8").match(/ADMIN_PASSWORD="(.*)"/)[1];
const ADMIN_EMAIL = readFileSync(".env", "utf8").match(/ADMIN_EMAIL="(.*)"/)[1];
const db = new PrismaClient();
let fail = 0;
const t = (n, c) => { console.log(c ? "PASS" : "FAIL", n); if (!c) fail++; };
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle0" });
const text = () => page.evaluate(() => document.body.innerText);
const status = async (p) => (await fetch(BASE + p, { redirect: "manual" })).status;
// set value on a React-controlled input
const setv = (sel, v) => page.$eval(sel, (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, v);
const click = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll("button,a")].find((x) => x.innerText.trim() === l); if (!b) throw new Error("no button " + l); b.click(); }, label);
const submit = async (label) => { await click(label); await new Promise((r) => setTimeout(r, 1500)); await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {}); };
const LONG = "This is a deliberately long body paragraph written for the editorial end-to-end test so that it clears the three hundred character minimum needed to publish an article. It talks about a made-up scenario only for testing. ".repeat(2);
const SLUG = "e2e-editorial-piece";
const cleanup = async () => {
  await db.articleBusiness.deleteMany({ where: { article: { slug: { startsWith: "e2e-" } } } });
  await db.article.deleteMany({ where: { slug: { startsWith: "e2e-" } } });
  await db.article.deleteMany({ where: { title: { startsWith: "E2E " } } });
  await db.author.deleteMany({ where: { slug: { startsWith: "e2e-" } } });
  await db.business.updateMany({ data: { ownedByFounder: false } });
};
await cleanup();

// login
await go("/admin/login"); await page.type("#email", ADMIN_EMAIL); await page.type("#password", PW);
await Promise.all([page.click('form:has(#password) button'), page.waitForFunction(() => location.pathname === "/admin")]);

// API protection (no cookie)
t("business search API requires auth", (await fetch(BASE + "/admin/api/businesses?q=bri")).status === 401);

// author
await go("/admin/authors/new");
await setv("#name", "E2E Author"); await setv("#slug", "e2e-author"); await setv("#bio", "Writes test copy.");
await submit("Save author");
t("author created", (await db.author.findUnique({ where: { slug: "e2e-author" } })) !== null);
const author = await db.author.findUnique({ where: { slug: "e2e-author" } });
await go("/admin/authors/new"); await setv("#name", "Dup"); await setv("#slug", "e2e-author"); await submit("Save author");
t("duplicate author slug rejected", (await text()).includes("Slug already in use"));

// new article: validation + state preserved
await go("/admin/articles/new?type=NEWS");
await setv("#title", "E2E Editorial Piece");
t("slug auto-generated from title", (await page.$eval("#slug", (e) => e.value)) === "e2e-editorial-piece");
await setv("#standfirst", "Too short");
await setv("#body", "Short body");
await submit("Publish now");
const txt = await text();
t("publish blocked: standfirst + body rules", txt.includes("Standfirst must be at least 30") && txt.includes("Body must be at least 300"));
t("form values preserved after validation error", (await page.$eval("#title", (e) => e.value)) === "E2E Editorial Piece" && (await page.$eval("#body", (e) => e.value)) === "Short body");
t("nothing saved when validation fails", (await db.article.count({ where: { slug: SLUG } })) === 0);

// toolbar inserts markdown
await setv("#body", "");
await click("H2");
t("toolbar inserts heading markdown", (await page.$eval("#body", (e) => e.value)).startsWith("## Heading"));

// draft save with hostile content
const body = `## Heading\n\n${LONG}\n\n**bold text** and *italic* with [bad link](javascript:alert(1)) and [good link](https://example.com).\n\n<script>window.__pwned=1</script>\n\n<img src=x onerror="window.__pwned=2">\n\n> a quote\n\n- one\n- two`;
await setv("#standfirst", "A standfirst that is comfortably longer than thirty characters.");
await setv("#body", body);
await setv("#authorId", author.id);
await submit("Save draft");
t("draft saved + redirected to edit", page.url().includes("/admin/articles/") && (await text()).includes("Saved"));
const art = await db.article.findUnique({ where: { slug: SLUG } });
t("saved as DRAFT, no publish date", art?.status === "DRAFT" && art.publishedAt === null && art.isSample === false);
t("draft 404 publicly", (await status("/news/" + SLUG)) === 404);
await go(`/admin/articles/${art.id}/preview`);
t("preview works for draft", (await text()).includes("PREVIEW — Draft") && (await text()).includes("E2E Editorial Piece"));
t("preview markup safe", await page.evaluate(() => !window.__pwned && !document.querySelector("article script")));

// preview tab in editor
await go(`/admin/articles/${art.id}`);
await click("Preview");
t("editor live preview renders", (await page.evaluate(() => !!document.querySelector(".prose-ps strong"))));

// publish
await submit("Publish now");
t("published", (await text()).includes("Published"));
const pub = await db.article.findUnique({ where: { id: art.id } });
t("status PUBLISHED with publishedAt", pub.status === "PUBLISHED" && pub.publishedAt && pub.publishedAt <= new Date());
await go("/news/" + SLUG);
t("public page live", (await text()).includes("E2E Editorial Piece"));
t("public XSS-safe: no injected script/img handlers", await page.evaluate(() => !window.__pwned && ![...document.querySelectorAll(".prose-ps script")].length && ![...document.querySelectorAll(".prose-ps img")].some((i) => i.getAttribute("onerror"))));
t("javascript: link not rendered as href", await page.evaluate(() => ![...document.querySelectorAll(".prose-ps a")].some((a) => /^javascript:/i.test(a.getAttribute("href") ?? ""))));
t("bold/italic/links rendered", await page.evaluate(() => !!document.querySelector(".prose-ps strong") && !!document.querySelector(".prose-ps em") && !![...document.querySelectorAll(".prose-ps a")].find((a) => a.href.startsWith("https://example.com"))));
t("author link + reading time", (await text()).includes("E2E Author") && /min read/.test(await text()));
const ld = await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)));
const na = ld.flat().find((x) => x["@type"] === "NewsArticle");
t("NewsArticle JSON-LD with author", na?.author?.name === "E2E Author" && na.headline === "E2E Editorial Piece");
t("appears on /news hub", (await (await fetch(BASE + "/news")).text()).includes("E2E Editorial Piece"));
const smIdx = await (await fetch(BASE + "/sitemap.xml")).text();
let smAll = ""; for (const m of smIdx.matchAll(/<loc>([^<]+)<\/loc>/g)) smAll += await (await fetch(BASE + new URL(m[1]).pathname)).text();
t("in sitemap (real, indexable) via the sitemap index", smIdx.includes("<sitemapindex") && smAll.includes("/news/" + SLUG));
t("in RSS feed", (await (await fetch(BASE + "/feed.xml")).text()).includes("E2E Editorial Piece"));
await go("/authors/e2e-author");
t("author page lists article", (await text()).includes("E2E Editorial Piece"));
t("live article not deletable", await (async () => { await go(`/admin/articles/${art.id}`); await click("Delete this article"); await new Promise((r) => setTimeout(r, 1500)); return (await db.article.count({ where: { id: art.id } })) === 1; })());
t("author with articles not deletable", await (async () => { await go("/admin/authors"); await page.evaluate(() => [...document.querySelectorAll("li")].find((l) => l.innerText.includes("E2E Author")).querySelector("button").click()); await new Promise((r) => setTimeout(r, 1500)); return (await db.author.count({ where: { slug: "e2e-author" } })) === 1; })());

// slug uniqueness
await go("/admin/articles/new?type=NEWS");
await setv("#title", "E2E Another"); await setv("#slug", SLUG); await setv("#authorId", author.id); await submit("Save draft");
t("duplicate article slug rejected", (await text()).includes("already used"));

// sponsored needs sponsor name; banner shown
await go(`/admin/articles/${art.id}`);
await setv("#disclosure", "SPONSORED"); await submit("Save changes");
t("sponsored requires sponsor name", (await text()).includes("Name the sponsor"));
await setv("#sponsorName", "Acme Ltd"); await submit("Save changes");
await go("/news/" + SLUG);
t("sponsored label + sponsor shown to readers", (await text()).includes("Sponsored content") && (await text()).includes("Acme Ltd"));
t("RSS labels sponsored", (await (await fetch(BASE + "/feed.xml")).text()).includes("[SPONSORED] E2E Editorial Piece"));
await go(`/admin/articles/${art.id}`); await setv("#disclosure", "EDITORIAL"); await submit("Save changes");

// unpublish
await submit("Unpublish");
t("unpublish → draft, 404 publicly", (await db.article.findUnique({ where: { id: art.id } })).status === "DRAFT" && (await status("/news/" + SLUG)) === 404);

// interview needs business; BOTW can't be sponsored; founder disclosure
await go("/admin/articles/new?type=INTERVIEW");
await setv("#title", "E2E Interview"); await setv("#standfirst", "An interview standfirst that is long enough to publish."); await setv("#body", LONG); await setv("#authorId", author.id);
await submit("Publish now");
t("interview needs a linked business", (await text()).includes("must link at least one business"));
await page.type("#bq", "Brightwell");
await page.waitForFunction(() => [...document.querySelectorAll("li button")].some((b) => b.innerText.includes("Brightwell")), { timeout: 5000 });
await click("Brightwell Cleaning Co Cleaning · Hackney");
t("picker adds business chip", (await text()).includes("Brightwell Cleaning Co") && (await page.$$('input[name="businessIds"]')).length === 1);
await db.business.update({ where: { slug: "brightwell-cleaning-co" }, data: { ownedByFounder: true } });
await submit("Publish now");
const iv = await db.article.findFirst({ where: { title: "E2E Interview" }, include: { businesses: true } });
t("interview published with linked business", iv?.status === "PUBLISHED" && iv.businesses.length === 1);
await go(`/interviews/${iv.slug}`);
t("founder-owned disclosure shown automatically", (await text()).includes("owned by PrimeStreet's founder"));
await go("/admin/articles/new?type=BOTW");
await setv("#title", "E2E Botw"); await setv("#standfirst", "A business of the week standfirst long enough."); await setv("#body", LONG); await setv("#authorId", author.id); await setv("#disclosure", "SPONSORED"); await setv("#sponsorName", "X");
await submit("Publish now");
t("BOTW can't be sponsored", (await text()).includes("always editorial"));

// scheduling
await go(`/admin/articles/${art.id}`);
await submit("Schedule");
t("schedule requires a date", (await text()).includes("Choose a date and time"));
await setv("#publishedAt", "2020-01-01T09:00"); await submit("Schedule");
t("past schedule rejected", (await text()).includes("must be in the future"));
const future = new Date(Date.now() + 2 * 86400000); const pad = (n) => String(n).padStart(2, "0");
await setv("#publishedAt", `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T09:30`); await submit("Schedule");
const sch = await db.article.findUnique({ where: { id: art.id } });
t("scheduled: PUBLISHED with future date", sch.status === "PUBLISHED" && sch.publishedAt > new Date());
t("scheduled article hidden publicly", (await status("/news/" + SLUG)) === 404 && !(await (await fetch(BASE + "/news")).text()).includes("E2E Editorial Piece"));
t("London time stored correctly (09:30 local)", new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(sch.publishedAt) === "09:30");
await go("/admin/articles?status=scheduled");
t("admin lists it as Scheduled", (await text()).includes("E2E Editorial Piece") && (await text()).includes("Scheduled"));
await db.article.update({ where: { id: art.id }, data: { publishedAt: new Date(Date.now() - 1000) } });
t("goes live automatically once time passes", (await status("/news/" + SLUG)) === 200);

// editorial balance warning
await db.article.deleteMany({ where: { title: "E2E Interview" } });
const biz = await db.business.findUnique({ where: { slug: "brightwell-cleaning-co" } });
for (let i = 0; i < 5; i++) await db.article.create({ data: { slug: `e2e-bal-${i}`, type: "NEWS", title: `E2E Bal ${i}`, standfirst: "x".repeat(40), body: "x".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - i * 1000), authorId: author.id, isSample: false, businesses: { create: [{ businessId: biz.id }] } } });
await go("/admin/articles");
t("editorial balance warning shown", (await text()).includes("Editorial balance"));

// delete draft
await db.article.update({ where: { id: art.id }, data: { status: "DRAFT", publishedAt: null } });
await go(`/admin/articles/${art.id}`); await click("Delete this article"); await new Promise((r) => setTimeout(r, 1500));
t("draft can be deleted", (await db.article.count({ where: { id: art.id } })) === 0);

// form-state preservation on the public forms (React 19 resets uncontrolled fields)
await go("/claim"); await page.type("#name", "Keep Me"); await page.type("#email", "bad-email");
await page.evaluate(() => [...document.querySelectorAll("form button")].find((b) => b.innerText.includes("Submit")).click());
await page.waitForFunction(() => document.body.innerText.includes("Enter a valid email"), { timeout: 8000 });
await new Promise((r) => setTimeout(r, 500));
t("claim form keeps typed values after error", (await page.$eval("#name", (e) => e.value)) === "Keep Me" && (await page.$eval("#email", (e) => e.value)) === "bad-email");

await cleanup(); await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL EDITORIAL E2E PASSED"); process.exit(fail ? 1 : 0);
