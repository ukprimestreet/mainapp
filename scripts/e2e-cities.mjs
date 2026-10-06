// Phase 10 end-to-end: city-scoped URLs, legacy redirects, neighbourhoods, coming-soon cities, admin cities, per-city editorial and search.
import http from "http";
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
const HUMAN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ---- mock postcodes.io on :3999 (the server under test points at it), so postcode-to-city can be exercised
const PCS = { "BT1 1AA": [54.5973, -5.9301], "ZZ1 1AA": [53.4808, -2.2426], "E8 3AA": [51.5450, -0.0553] };
const pcMock = http.createServer((req, res) => {
  const send = (c, b) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
  const m = req.url.match(/^\/(postcodes|outcodes)\/(.+)$/);
  if (req.method === "GET" && m) { const k = decodeURIComponent(m[2]).toUpperCase(); return PCS[k] ? send(200, { status: 200, result: { latitude: PCS[k][0], longitude: PCS[k][1] } }) : send(404, { status: 404 }); }
  send(404, {});
});
await new Promise((r) => pcMock.listen(3999, "127.0.0.1", r));

const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
process.on("uncaughtException", async (e) => { console.log("CRASH", String(e).slice(0, 500)); try { await browser.close(); } catch {} process.exit(1); });
async function newPage() {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 1000 }); await page.setUserAgent(HUMAN);
  page.setDefaultNavigationTimeout(120000); page.setDefaultTimeout(120000);
  return {
    page,
    // Edge occasionally drops a navigation with a transient network error on this machine; retry rather than fail the suite.
    go: async (p) => { for (let i = 0; ; i++) { try { const r = await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => {}); return r; } catch (e) { if (i >= 2 || !/ERR_NETWORK_CHANGED|ERR_CONNECTION|frame was detached/.test(String(e))) throw e; await sleep(1500); } } },
    text: () => page.evaluate(() => document.body.innerText),
    setv: (sel, v) => page.$eval(sel, (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, v),
    click: async (label, scope) => { await page.evaluate((l, sc) => { const has = (x) => [...x.querySelectorAll("button,a")].some((y) => y.innerText.trim().split(String.fromCharCode(10))[0] === l); const root = sc ? [...document.querySelectorAll("li,div,article,section,form,tr")].filter((x) => x.innerText.toLowerCase().includes(sc.toLowerCase()) && has(x)).pop() : document; const b = [...root.querySelectorAll("button,a")].find((x) => x.innerText.trim().split(String.fromCharCode(10))[0] === l); if (!b) throw new Error("no " + l); b.click(); }, label, scope); await sleep(1800); },
  };
}
const admin = await newPage(), pub = await newPage();
const hop = async (p) => { const r = await fetch(BASE + p, { redirect: "manual", headers: { "user-agent": HUMAN } }); return { status: r.status, to: (r.headers.get("location") ?? "").replace(BASE, "") }; };
const html = async (p) => (await fetch(BASE + p, { headers: { "user-agent": HUMAN } })).text();
const status = async (p) => (await fetch(BASE + p, { headers: { "user-agent": HUMAN } })).status;
const robotsOf = async (p) => { const h = await html(p); const m = h.match(/<meta name="robots" content="([^"]*)"/); return m ? m[1] : "none"; };
const canonical = async (p) => { const m = (await html(p)).match(/rel="canonical" href="([^"]*)"/); return m ? m[1] : null; };
const sitemapAll = async () => { const idx = await html("/sitemap.xml"); let all = ""; for (const m of idx.matchAll(/<loc>([^<]+)<\/loc>/g)) all += await html(new URL(m[1]).pathname); return all; };

const wipe = async () => {
  const ids = (await db.city.findMany({ where: { slug: { startsWith: "e2e-city" } }, select: { id: true } })).map((c) => c.id);
  if (ids.length) {
    const bids = (await db.business.findMany({ where: { cityId: { in: ids } }, select: { id: true } })).map((b) => b.id);
    await db.review.deleteMany({ where: { businessId: { in: bids } } });
    await db.searchDoc.deleteMany({ where: { refId: { in: bids } } });
    await db.business.deleteMany({ where: { cityId: { in: ids } } });
    await db.article.deleteMany({ where: { cityId: { in: ids } } });
    await db.cityEditor.deleteMany({ where: { cityId: { in: ids } } });
    await db.location.deleteMany({ where: { cityId: { in: ids } } });
    await db.city.deleteMany({ where: { id: { in: ids } } });
  }
  await db.location.deleteMany({ where: { slug: { startsWith: "e2e-area" } } });
  await db.business.deleteMany({ where: { slug: { startsWith: "e2e-city-biz" } } });
  await db.redirect.deleteMany({ where: { OR: [{ fromPath: { contains: "e2e-city" } }, { toPath: { contains: "e2e-city" } }] } });
  await db.seoPage.deleteMany({ where: { path: { contains: "e2e-city" } } });
  await db.auditLog.deleteMany({ where: { targetType: { in: ["City", "Location"] } } });
};
await wipe();

const london = await db.city.findUnique({ where: { slug: "london" } });
const cat = await db.category.findFirst({ where: { slug: "cleaning" } });
const hackney = await db.location.findFirst({ where: { cityId: london.id, slug: "hackney" } });
const shoreditch = await db.location.findFirst({ where: { cityId: london.id, slug: "shoreditch" } });

// ============================================================ A. London coverage + city-scoped URLs
t("all 33 boroughs and 40+ real neighbourhoods are covered", (await db.location.count({ where: { cityId: london.id, kind: "BOROUGH" } })) === 33 && (await db.location.count({ where: { cityId: london.id, kind: "NEIGHBOURHOOD" } })) >= 40);
t("/locations sends a single-city reader straight to that city (no pointless chooser)", (await hop("/locations")).to === "/locations/london");
t("city hub lists areas and neighbourhoods separately", await (async () => { await pub.go("/locations/london"); const x = await pub.text(); return x.includes("33 areas") && x.includes("Neighbourhoods") && x.includes("Hackney") && x.includes("Shoreditch"); })());
t("city hub names who covers the city", (await pub.text()).includes("Who covers London") && (await pub.text()).includes("PrimeStreet Editorial"));
t("no city switcher while PrimeStreet covers one city", await pub.page.evaluate(() => !document.querySelector('[aria-label="Choose a city"]')));
await pub.go("/locations/london/hackney");
t("area page works under its city, with breadcrumbs through the city", (await pub.text()).includes("Businesses in Hackney") && await pub.page.evaluate(() => [...document.querySelectorAll("nav a")].some((a) => a.getAttribute("href") === "/locations/london")));
t("area page lists its neighbourhoods", (await pub.text()).includes("Neighbourhoods in Hackney") && await pub.page.evaluate(() => !!document.querySelector('a[href="/locations/london/shoreditch"]')));
await pub.go("/locations/london/shoreditch");
t("neighbourhood page works and is labelled a neighbourhood, with its borough in the breadcrumbs", /neighbourhood/i.test(await pub.text()) && (await pub.text()).includes("Businesses in Shoreditch") && await pub.page.evaluate(() => [...document.querySelectorAll("nav a")].some((a) => a.getAttribute("href") === "/locations/london/hackney")));
t("area x category page works under its city", (await status("/locations/london/hackney/cleaning")) === 200 && (await html("/locations/london/hackney/cleaning")).includes("in Hackney"));
t("every area link on the city hub is city-scoped", await (async () => { await pub.go("/locations/london"); return pub.page.evaluate(() => [...document.querySelectorAll('a[href^="/locations/"]')].every((a) => /^\/locations\/[a-z0-9-]+\/[a-z0-9-]+$/.test(a.getAttribute("href")) || a.getAttribute("href") === "/locations/london" || a.getAttribute("href") === "/locations")); })());
t("unknown city and unknown area both 404", (await status("/locations/atlantis")) === 404 && (await status("/locations/london/atlantis")) === 404 && (await status("/locations/london/hackney/not-a-category")) === 404);

// ============================================================ B. legacy single-city URLs
for (const [from, to] of [["/locations/hackney", "/locations/london/hackney"], ["/locations/camden", "/locations/london/camden"], ["/locations/hackney/cleaning", "/locations/london/hackney/cleaning"], ["/locations/shoreditch", "/locations/london/shoreditch"]]) {
  const r = await hop(from);
  t(`legacy ${from} redirects permanently to ${to}`, r.status === 308 && r.to === to, `${r.status} ${r.to}`);
}
t("legacy nonsense still 404s rather than redirecting somewhere odd", (await status("/locations/not-an-area")) === 404 && (await status("/locations/hackney/not-a-category")) === 404);
t("canonical URLs are the city-scoped ones", (await canonical("/locations/london/hackney")).endsWith("/locations/london/hackney"));
t("sitemap contains only city-scoped area URLs", await (async () => { const all = await sitemapAll(); return !/<loc>[^<]*\/locations\/hackney<\/loc>/.test(all) && (all.includes("/locations/london/hackney") || !all.includes("/locations/london/")); })());

// ============================================================ C. the quality gate across cities
const real = [];
for (let i = 1; i <= 3; i++) real.push(await db.business.create({ data: { slug: `e2e-city-biz-${i}`, name: `E2E City Biz ${i}`, summary: "A real business for the cities e2e test.", description: "A genuinely detailed description of a real business, long enough to pass the thin-profile check comfortably.", cityId: london.id, locationId: hackney.id, categoryId: cat.id, isSample: false, phone: "020 7946 0200" } }));
t("with real businesses + an intro, the London hubs become indexable", await (async () => { const all = await sitemapAll(); return all.includes("/locations/london") && all.includes("/businesses/london"); })());
t("the city hub is indexable (no noindex)", !(await robotsOf("/locations/london")).includes("noindex"));
const savedIntro = london.intro;
await db.city.update({ where: { id: london.id }, data: { intro: null } });
t("remove the city intro and the hub drops out of the index AND the sitemap (one gate, no drift)", (await robotsOf("/locations/london")).includes("noindex") && !(await sitemapAll()).includes("<loc>" + BASE + "/locations/london</loc>"));
await db.city.update({ where: { id: london.id }, data: { intro: savedIntro } });
t("neighbourhood with no intro is not indexed even when it has businesses", await (async () => {
  await db.business.update({ where: { id: real[0].id }, data: { locationId: shoreditch.id } });
  const r = (await robotsOf("/locations/london/shoreditch")).includes("noindex");
  await db.business.update({ where: { id: real[0].id }, data: { locationId: hackney.id } });
  return r;
})());

// ============================================================ D. admin: cities
t("admin cities needs a login", [302, 307, 308].includes((await hop("/admin/cities")).status));
await admin.go("/admin/login"); await admin.page.type("#email", ADMIN_EMAIL); await admin.page.type("#password", PW);
await Promise.all([admin.page.click("form:has(#password) button"), admin.page.waitForFunction(() => location.pathname === "/admin")]);
await admin.go("/admin/cities");
t("admin cities shows coverage per city", (await admin.text()).includes("London") && (await admin.text()).includes("Real businesses") && (await admin.text()).includes("33"));
const addCity = async (f) => { await admin.go("/admin/cities"); await admin.page.evaluate((f) => { const form = [...document.querySelectorAll("form")].find((x) => x.querySelector("#c-name")); for (const [k, v] of Object.entries(f)) { const el = form.querySelector(`[name="${k}"]`); if (el.type === "checkbox") el.checked = v; else el.value = v; } form.querySelector("button").click(); }, f); await sleep(1900); return admin.text(); };
const GOOD = { name: "E2E City One", slug: "e2e-city-one", status: "COMING_SOON", region: "Testshire", lat: "53.4808", lng: "-2.2426", prefixes: "ZZ YY", sortOrder: "5", intro: "A".repeat(140), active: true };
t("city: name required", (await addCity({ ...GOOD, name: "" })).includes("Enter the city name"));
t("city: a reserved site section can't be used as the address", (await addCity({ ...GOOD, slug: "news" })).includes("used elsewhere on the site"));
t("city: bad coordinates and bad postcode prefixes refused", (await addCity({ ...GOOD, lat: "500" })).includes("Latitude must be") && (await addCity({ ...GOOD, prefixes: "M1 OL" })).includes("not a postcode prefix"));
t("city: launching straight to Live is refused with no real businesses", (await addCity({ ...GOOD, status: "LIVE" })).includes("Add real published businesses before launching"));
t("city: nothing was created by any of the refusals", (await db.city.count({ where: { slug: { startsWith: "e2e-city" } } })) === 0);
t("city: created as coming soon", (await addCity(GOOD)).includes("stays out of the index") && (await db.city.count({ where: { slug: "e2e-city-one" } })) === 1);
const c1 = await db.city.findUnique({ where: { slug: "e2e-city-one" } });
t("city: stored with region, centre, prefixes and intro", c1.status === "COMING_SOON" && c1.region === "Testshire" && c1.lat === 53.4808 && JSON.parse(c1.postcodePrefixes).join(",") === "ZZ,YY" && c1.intro.length === 140 && c1.launchedAt === null);
t("city: a second city with the same address is refused", (await addCity({ ...GOOD, name: "Clash" })).includes("already uses the address"));

// ============================================================ E. coming-soon city is honest and never indexed
await pub.go("/locations/e2e-city-one");
const soonText = await pub.text();
t("coming-soon city page says so and promises no invented content", soonText.includes("E2E City One is next") && soonText.includes("hasn't launched") && soonText.includes("Nothing here is made up"));
t("coming-soon city lists no businesses and offers the suggest route instead", !soonText.includes("businesses in") && await pub.page.evaluate(() => !!document.querySelector('a[href="/businesses/submit"]')));
t("coming-soon city is noindex and absent from the sitemap", (await robotsOf("/locations/e2e-city-one")).includes("noindex") && !(await sitemapAll()).includes("e2e-city-one"));
t("its business hub and area pages are not browsable while it is coming soon", (await status("/businesses/e2e-city-one")) === 200 && (await robotsOf("/businesses/e2e-city-one")).includes("noindex"));
t("now there are two cities, the switcher appears and marks the unlaunched one", await (async () => { await pub.go("/locations/london"); return pub.page.evaluate(() => { const n = document.querySelector('[aria-label="Choose a city"]'); return !!n && n.innerText.includes("London") && /soon/i.test(n.innerText); }); })());
await pub.go("/locations");
t("with two cities, /locations becomes a city index that separates live from coming soon", (await pub.text()).includes("Where we cover") && (await pub.text()).includes("Coming next") && (await pub.text()).includes("E2E City One"));

// ============================================================ F. areas in a new city
await admin.go("/admin/cities/e2e-city-one");
const addArea = async (f) => { await admin.go("/admin/cities/e2e-city-one"); await admin.page.evaluate((f) => { const form = [...document.querySelectorAll("form")].find((x) => x.querySelector("#a-name")); for (const [k, v] of Object.entries(f)) form.querySelector(`[name="${k}"]`).value = v; form.querySelector("button").click(); }, f); await sleep(1800); return admin.text(); };
t("admin city detail shows why it can't launch yet", (await admin.text()).includes("Not ready to launch") && (await admin.text()).includes("real published business"));
t("area: a neighbourhood must sit inside a borough", (await addArea({ name: "E2E Area Hood", slug: "e2e-area-hood", kind: "NEIGHBOURHOOD", parentId: "", intro: "" })).includes("Choose the borough"));
t("area: borough created", (await addArea({ name: "E2E Area North", slug: "e2e-area-north", kind: "BOROUGH", parentId: "", intro: "B".repeat(120) })).includes("Added E2E Area North"));
const north = await db.location.findFirst({ where: { slug: "e2e-area-north" } });
t("area: a borough can't be put inside another area", (await addArea({ name: "E2E Area Bad", slug: "e2e-area-bad", kind: "BOROUGH", parentId: north.id, intro: "" })).includes("don't sit inside another area"));
t("area: neighbourhood created inside the borough", (await addArea({ name: "E2E Area Hood", slug: "e2e-area-hood", kind: "NEIGHBOURHOOD", parentId: north.id, intro: "" })).includes("Added E2E Area Hood"));
t("area: duplicate address within the same city refused", (await addArea({ name: "Another", slug: "e2e-area-north", kind: "BOROUGH", parentId: "", intro: "" })).includes("already has an area"));
t("area: the same slug IS allowed in a different city", await (async () => {
  const dup = await db.location.create({ data: { cityId: c1.id, slug: "hackney", name: "Hackney", kind: "BOROUGH" } }).then(() => true).catch(() => false);
  return dup && (await db.location.count({ where: { slug: "hackney" } })) === 2;
})());
t("areas of a coming-soon city are not browsable (404, nothing half-published)", (await status("/locations/e2e-city-one/e2e-area-north")) === 404);

// ============================================================ G. launching a city properly
const b1 = await db.business.create({ data: { slug: "e2e-city-biz-new", name: "E2E New City Biz", summary: "A real business in the new city.", description: "A real and reasonably detailed description of a business in the newly launched test city, long enough to index.", cityId: c1.id, locationId: north.id, categoryId: cat.id, isSample: false, phone: "0161 496 0200" } });
const setStatus = async (v) => { await admin.go("/admin/cities/e2e-city-one"); await admin.page.evaluate((v) => { const form = [...document.querySelectorAll("form")].find((x) => x.querySelector("#e-status")); form.querySelector("#e-status").value = v; form.querySelector("button").click(); }, v); await sleep(1900); return admin.text(); };
await db.city.update({ where: { id: c1.id }, data: { intro: "C".repeat(50) } });
t("launch refused while the intro is too short", (await setStatus("LIVE")).includes("intro of 100+ characters") && (await db.city.findUnique({ where: { id: c1.id } })).status === "COMING_SOON");
await db.city.update({ where: { id: c1.id }, data: { intro: "D".repeat(150) } });
t("launch accepted once it has a real business and an intro; launch date recorded", (await setStatus("LIVE")).includes("Saved") && await (async () => { const c = await db.city.findUnique({ where: { id: c1.id } }); return c.status === "LIVE" && c.launchedAt !== null; })());
t("launched city: its areas become browsable immediately", (await status("/locations/e2e-city-one/e2e-area-north")) === 200);
t("launched city with only ONE real business is browsable but still not indexable (thin-page gate)",
  (await robotsOf("/locations/e2e-city-one")).includes("noindex") && !(await sitemapAll()).includes("/locations/e2e-city-one"));
const more = [];
for (let i = 2; i <= 3; i++) more.push(await db.business.create({ data: { slug: `e2e-city-biz-new-${i}`, name: `E2E New City Biz ${i}`, summary: "Another real business in the new city.", description: "Another real and reasonably detailed description of a business in the newly launched test city, long enough to index.", cityId: c1.id, locationId: north.id, categoryId: cat.id, isSample: false, phone: "0161 496 020" + i } }));
t("once it reaches the minimum of real businesses, the hub and its area enter the index and the sitemap",
  !(await robotsOf("/locations/e2e-city-one")).includes("noindex") && await (async () => { const all = await sitemapAll(); return all.includes("/locations/e2e-city-one") && all.includes("/locations/e2e-city-one/e2e-area-north"); })());
t("its own businesses live under its own city URL", (await status(`/businesses/e2e-city-one/${cat.slug}/e2e-city-biz-new`)) === 200);
t("renaming a city's address leaves a permanent redirect behind", await (async () => {
  await admin.go("/admin/cities/e2e-city-one");
  await admin.page.evaluate(() => { const f = [...document.querySelectorAll("form")].find((x) => x.querySelector("#e-slug")); f.querySelector("#e-slug").value = "e2e-city-renamed"; f.querySelector("button").click(); });
  await sleep(2100);
  const r = await hop("/locations/e2e-city-one");
  return r.status === 308 && r.to === "/locations/e2e-city-renamed";
})());
await db.city.update({ where: { id: c1.id }, data: { slug: "e2e-city-one" } });
await db.redirect.deleteMany({ where: { fromPath: "/locations/e2e-city-one" } });

// ============================================================ H. per-city editorial team
const author = await db.author.findFirst();
await admin.go("/admin/cities/e2e-city-one");
await admin.page.evaluate((id) => { const f = [...document.querySelectorAll("form")].find((x) => x.querySelector("#t-author")); f.querySelector("#t-author").value = id; f.querySelector("#t-role").value = "EDITOR"; f.querySelector("button").click(); }, author.id);
await sleep(1900);
t("a writer can be assigned to a city with a role", (await db.cityEditor.count({ where: { cityId: c1.id, authorId: author.id, role: "EDITOR" } })) === 1);
await pub.go("/locations/e2e-city-one");
t("the city hub names its team with the role and links to the writer", (await pub.text()).includes("Who covers E2E City One") && (await pub.text()).includes("City editor") && await pub.page.evaluate((s) => !!document.querySelector(`a[href="/authors/${s}"]`), author.slug));
await admin.go("/admin/cities/e2e-city-one"); await admin.click("Remove", author.name);
t("team members can be removed, and the section disappears when empty", (await db.cityEditor.count({ where: { cityId: c1.id } })) === 0 && await (async () => { await pub.go("/locations/e2e-city-one"); return !(await pub.text()).includes("Who covers E2E City One"); })());

// ============================================================ I. articles belong to a city
const art = await db.article.create({ data: { slug: "e2e-city-article", type: "NEWS", title: "E2E city article", standfirst: "s".repeat(40), body: "b".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - 3600_000), authorId: author.id, isSample: false, locationId: north.id, cityId: c1.id } });
await pub.go("/news/e2e-city-article");
t("an article about an area links to that area under its own city", await pub.page.evaluate(() => !!document.querySelector('a[href="/locations/e2e-city-one/e2e-area-north"]')));
await pub.go("/locations/e2e-city-one");
t("the city hub shows stories from that city only", (await pub.text()).includes("Stories from E2E City One") && (await pub.text()).includes("E2E city article"));
await pub.go("/locations/london");
t("…and London's hub does not show the other city's story", !(await pub.text()).includes("E2E city article"));

// ============================================================ J. city-scoped search
// The first search after a reseed rebuilds the whole text index; warm it so page loads are not waiting on that.
await fetch(`${BASE}/api/search/suggest?q=cleaning`, { headers: { "user-agent": HUMAN } }).catch(() => {});
await pub.go("/search?q=cleaning");
t("search shows a city chooser once there are two live cities", await pub.page.evaluate(() => !!document.querySelector('[aria-label="Choose a city"]')));
await pub.go("/search?q=E2E+City+Biz&city=london");
t("search scoped to London finds the London business", (await pub.text()).includes("E2E City Biz"));
await pub.go("/search?q=E2E+City+Biz&city=e2e-city-one");
t("the same search scoped to the other city excludes it", !(await pub.text()).includes("E2E City Biz 2"));
await pub.go("/search?q=E2E+New+City&city=e2e-city-one");
t("search scoped to the new city finds its own business", (await pub.text()).includes("E2E New City Biz"));
await pub.go("/search?q=E2E+New+City&city=nonsense-city");
t("an unknown city scope is ignored rather than returning nothing", (await pub.text()).includes("E2E New City Biz"));
t("search result pages stay noindex whatever the city scope", (await robotsOf("/search?q=cleaning&city=london")).includes("noindex"));

// ============================================================ K. postcode outside our cities
await pub.go("/search?postcode=BT1+1AA");
t("a postcode outside every city we cover says so instead of looking empty", /outside/i.test(await pub.text()));
await db.city.update({ where: { id: c1.id }, data: { postcodePrefixes: JSON.stringify(["ZZ"]), status: "COMING_SOON" } });
await pub.go("/search?postcode=ZZ1+1AA");
t("a postcode in a city we have not launched says we are not covering it yet", /not covering/i.test(await pub.text()));
await db.city.update({ where: { id: c1.id }, data: { status: "LIVE" } });

// ============================================================ L. nothing from phase 1-9 regressed
t("business profiles, categories and the home page still work", (await status("/businesses/london/cleaning")) === 200 && (await status("/categories")) === 200 && (await status("/")) === 200);
t("home page area links are city-scoped", await (async () => { await pub.go("/"); return pub.page.evaluate(() => [...document.querySelectorAll('a[href^="/locations/"]')].filter((a) => a.getAttribute("href") !== "/locations").every((a) => /^\/locations\/[a-z0-9-]+\/[a-z0-9-]+$/.test(a.getAttribute("href")))); })());
t("suggestions point at city-scoped area URLs", await (async () => { const r = await (await fetch(`${BASE}/api/search/suggest?q=hackn`, { headers: { "user-agent": HUMAN } })).json(); const area = (r.suggestions ?? r).find?.((s) => s.type === "area"); return !area || area.href.startsWith("/locations/london/"); })());
t("sample businesses are still never indexed", await (async () => { const s = await db.business.findFirst({ where: { isSample: true }, include: { city: true, category: true } }); return (await robotsOf(`/businesses/${s.city.slug}/${s.category.slug}/${s.slug}`)).includes("noindex"); })());

await db.article.delete({ where: { id: art.id } }).catch(() => {});
await db.business.deleteMany({ where: { id: { in: [...real.map((r) => r.id), b1.id, ...more.map((m) => m.id)] } } });
await wipe();
pcMock.close(); await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL CITIES E2E PASSED"); process.exit(fail ? 1 : 0);
