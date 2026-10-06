// SEO audit: builds a realistic fixture, crawls the sitemap index, and checks every indexable page.
// Run against `next start` (BASE env, default http://localhost:3000) with a seeded DB.
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ENV = readFileSync(".env", "utf8");
const SITE = ENV.match(/NEXT_PUBLIC_SITE_URL="(.*)"/)?.[1] ?? BASE;
const db = new PrismaClient();
let fail = 0, warn = 0;
const t = (n, c, detail = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : detail); if (!c) fail++; };
const w = (n, c, detail = "") => { if (!c) { console.log("WARN", n, detail); warn++; } };
const local = (u) => u.replace(/^https?:\/\/[^/]+/, BASE);
const get = (p, opts = {}) => fetch(BASE + p, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 SEOAudit" }, ...opts });

// ---------------- fixture ----------------
const city = await db.city.findFirst();
const L = async (slug) => db.location.findUnique({ where: { slug } });
const C = async (slug) => db.category.findUnique({ where: { slug } });
const author = await db.author.findFirst();
const [hackney, camden, lambeth] = [await L("hackney"), await L("camden"), await L("lambeth")];
const [cleaning, cafes] = [await C("cleaning"), await C("cafes")];
async function wipe() {
  const ids = (await db.business.findMany({ where: { slug: { startsWith: "seo-fx-" } }, select: { id: true } })).map((b) => b.id);
  await db.review.deleteMany({ where: { businessId: { in: ids } } });
  await db.business.deleteMany({ where: { id: { in: ids } } });
  await db.article.deleteMany({ where: { slug: { startsWith: "seo-fx-" } } });
  await db.seoPage.deleteMany({ where: { path: { startsWith: "/" } } });
  await db.redirect.deleteMany({ where: { fromPath: { startsWith: "/seo-fx-" } } });
  await db.podcastEpisode.deleteMany({ where: { slug: { startsWith: "seo-fx-" } } });
}
await wipe();
const richDesc = (n) => `${n} is a locally run business with a track record of reliable, friendly service for households and small firms, founded by people who live in the neighbourhood and know it well.`;
let counter = 0;
const mk = (loc, cat, name, extra = {}) => db.business.create({ data: { slug: `seo-fx-${++counter}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, name, summary: `${name} serves local customers across the borough.`, description: richDesc(name), cityId: city.id, locationId: loc.id, categoryId: cat.id, isSample: false, phone: "020 7946 0" + String(100 + counter), website: `https://seo-fx-${counter}.example`, openingHours: '{"mon":"09:00-17:00","tue":"09:00-17:00"}', services: '["One","Two","Three"]', ...extra } });
for (let i = 1; i <= 6; i++) await mk(hackney, cleaning, `Hackney Clean ${i}`);
for (let i = 1; i <= 3; i++) await mk(hackney, cafes, `Hackney Cafe ${i}`);
for (let i = 1; i <= 3; i++) await mk(camden, cleaning, `Camden Clean ${i}`);
const lamb = await mk(lambeth, cleaning, "Lambeth Clean Solo");
const thin = await db.business.create({ data: { slug: "seo-fx-thin", name: "Thin Biz Ltd", summary: "Thin business with almost no details.", description: "A very short description only here.", cityId: city.id, locationId: hackney.id, categoryId: cleaning.id, isSample: false } });
const rated = await db.business.findFirst({ where: { slug: { startsWith: "seo-fx-1-" } } });
await db.review.create({ data: { businessId: rated.id, authorName: "Real Reviewer", authorEmail: "rr@example.com", authorEmailHash: "seo-fx-rr", rating: 5, title: "Great", body: "Genuinely excellent service from start to finish, would recommend.", status: "PUBLISHED", bodyHash: "seo-fx-1" } });
await db.business.update({ where: { id: rated.id }, data: { ratingAvg: 5, ratingCount: 1, imageUrl: "https://images.example/hero.jpg" } });
await db.location.update({ where: { id: hackney.id }, data: { intro: "Hackney is one of London's most active small-business boroughs, with independent cafes, cleaners and trades clustered around Broadway Market, Dalston and Stoke Newington." } });
await db.seoPage.create({ data: { path: "/businesses/london/cleaning", intro: "Cleaning is one of the most searched-for local services in London. This page lists independent domestic and commercial cleaners with profiles, services, areas covered and customer reviews." } });
await db.article.create({ data: { slug: "seo-fx-news", type: "NEWS", title: "A new cleaning firm opens in Hackney", standfirst: "A locally owned firm has opened its doors serving homes and offices.", body: "x".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - 86400000), authorId: author.id, isSample: false, locationId: hackney.id, imageUrl: "https://images.example/a.jpg", imageAlt: "A cleaner at work" } });
await db.article.create({ data: { slug: "seo-fx-guide", type: "GUIDE", title: "How to choose a cleaner in East London", standfirst: "What to ask, what to check and what it should cost across the borough.", body: "y".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - 2 * 86400000), authorId: author.id, isSample: false } });
await db.podcastEpisode.create({ data: { slug: "seo-fx-ep-1", number: 9201, title: "Fixture episode: how a cleaning firm grew", description: "A fixture episode about how a local cleaning firm grew from one van to a team of twenty serving East London.", showNotes: "## Notes\n\n" + "Show notes text for the fixture episode. ".repeat(8), transcript: "Host: Welcome.\nGuest: Thanks. " + "Transcript text. ".repeat(20), chapters: JSON.stringify([{ t: 0, title: "Welcome" }, { t: 300, title: "The first van" }]), audioUrl: "https://cdn.example/fx.mp3", audioBytes: 4000000, durationSec: 1800, videoUrl: "https://youtu.be/dQw4w9WgXcQ", guestName: "Fixture Guest", status: "PUBLISHED", publishedAt: new Date(Date.now() - 86400000), isSample: false } });
await db.podcastEpisode.create({ data: { slug: "seo-fx-ep-thin", number: 9202, title: "Fixture thin audio-only episode", description: "A fixture audio-only episode with no transcript and no show notes, which must stay out of the index.", audioUrl: "https://cdn.example/thin.mp3", audioBytes: 1000, durationSec: 60, status: "PUBLISHED", publishedAt: new Date(Date.now() - 86400000), isSample: false } });
await db.redirect.create({ data: { fromPath: "/seo-fx-old-page", toPath: "/locations/hackney" } });
await db.redirect.create({ data: { fromPath: "/seo-fx-old-chain", toPath: "/seo-fx-old-page" } });

// ---------------- crawl sitemap ----------------
const idx = await (await get("/sitemap.xml")).text();
const children = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => local(m[1]));
t("sitemap index lists child sitemaps", children.length >= 4 && idx.includes("<sitemapindex"), idx.slice(0, 200));
const urls = [];
for (const c of children) {
  const r = await fetch(c); const x = await r.text();
  t(`child sitemap OK: ${c.split("/").pop()}`, r.status === 200 && x.includes("<urlset"));
  for (const m of x.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) urls.push({ loc: m[1], lastmod: m[2] });
}
const paths = urls.map((u) => new URL(u.loc).pathname);
t("no duplicate URLs in sitemaps", new Set(paths).size === paths.length);
t("all sitemap URLs absolute on the site host, no query strings", urls.every((u) => u.loc.startsWith(SITE) && !u.loc.includes("?")));
t("lastmod values are valid dates", urls.every((u) => !u.lastmod || /^\d{4}-\d{2}-\d{2}$/.test(u.lastmod)));
const inMap = (p) => paths.includes(p);

// ---------------- quality gate expectations ----------------
const bizPath = (b, cat = "cleaning") => `/businesses/london/${cat}/${b.slug}`;
t("gate: Hackney area (6+ real, has intro) IS in sitemap", inMap("/locations/hackney"));
t("gate: Hackney × cleaning (6 real ≥5) IS in sitemap (no custom intro needed)", inMap("/locations/hackney/cleaning"));
t("gate: Hackney × cafes (3 real, no intro, <5) is NOT in sitemap", !inMap("/locations/hackney/cafes"));
t("gate: Camden area (3 real but no intro) is NOT in sitemap", !inMap("/locations/camden"));
t("gate: Camden × cleaning (3 real, no intro) is NOT in sitemap", !inMap("/locations/camden/cleaning"));
t("gate: Lambeth × cleaning (1 real) is NOT in sitemap", !inMap("/locations/lambeth/cleaning"));
t("gate: cleaning category (≥3 real + SeoPage intro) IS in sitemap", inMap("/businesses/london/cleaning"));
t("gate: cafes category (3 real, no intro) is NOT in sitemap", !inMap("/businesses/london/cafes"));
t("gate: city hub /businesses/london IS in sitemap (≥3 real)", inMap("/businesses/london"));
t("gate: thin profile NOT in sitemap, full profiles ARE", !inMap(bizPath(thin)) && inMap(bizPath(rated)));
t("gate: sample data never in sitemap", !paths.some((p) => /brightwell|kiln-and-ember|inside-the-business/.test(p)));
t("gate: real articles ARE in sitemap, sample ones not", inMap("/news/seo-fx-news") && inMap("/guides/seo-fx-guide") && !paths.some((p) => p.includes("a-wood-fired")));
t("gate: podcast episode with transcript IS in sitemap; thin audio-only one is NOT", inMap("/podcast/seo-fx-ep-1") && !inMap("/podcast/seo-fx-ep-thin"));
t("gate: author with real articles listed", paths.some((p) => p.startsWith("/authors/")));
t("gate: no empty area×category page URLs or admin/owner/review URLs", !paths.some((p) => /^\/(admin|owner|review|reviews|claim\/status)/.test(p)));

const robotsOf = (html) => html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? "";
for (const [p, label] of [["/locations/camden", "Camden area"], ["/locations/camden/cleaning", "Camden × cleaning"], ["/locations/hackney/cafes", "Hackney × cafes"], ["/businesses/london/cafes", "cafes category"], [bizPath(thin), "thin profile"], ["/businesses?q=clean", "filtered directory"], ["/locations/hackney?page=2", "paginated area page"], ["/podcast/seo-fx-ep-thin", "thin audio-only episode"], ["/podcast?format=video", "filtered podcast index"]]) {
  const r = await get(p); const h = await r.text();
  t(`noindex consistency: ${label} is 200 + meta noindex`, r.status === 200 && robotsOf(h).includes("noindex"), `status=${r.status} robots="${robotsOf(h)}"`);
}

// ---------------- per-page checks for every indexable URL ----------------
const titles = new Map(), descs = new Map(), seenLinks = new Set();
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
for (const u of urls) {
  const p = new URL(u.loc).pathname;
  const r = await get(p); const h = await r.text();
  const pre = `[${p}]`;
  t(`${pre} 200`, r.status === 200, `status ${r.status}`);
  if (r.status !== 200) continue;
  const rob = robotsOf(h);
  t(`${pre} indexable (no noindex)`, !rob.includes("noindex"), rob);
  const canon = h.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  t(`${pre} canonical = self`, canon === SITE + (p === "/" ? "" : p) || canon === SITE + p || canon === SITE + "/", `canonical=${canon}`);
  const title = h.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  t(`${pre} title present (10–70 chars)`, title.length >= 10 && title.length <= 70, `"${title}" (${title.length})`);
  w(`${pre} title ≤ 60 chars`, title.length <= 60, `${title.length}`);
  if (titles.has(title)) t(`${pre} unique title`, false, `duplicates ${titles.get(title)}`); else titles.set(title, p);
  const desc = h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  t(`${pre} meta description 50–165 chars`, desc.length >= 50 && desc.length <= 165, `(${desc.length}) "${desc}"`);
  if (p !== "/" && descs.has(desc)) t(`${pre} unique description`, false, `duplicates ${descs.get(desc)}`); else descs.set(desc, p);
  t(`${pre} exactly one <h1>`, (h.match(/<h1[ >]/g) ?? []).length === 1);
  t(`${pre} html lang + viewport`, /<html lang="en-GB"/.test(h) && /name="viewport"/.test(h));
  t(`${pre} og:title/og:url/og:image present`, /property="og:title"/.test(h) && /property="og:url"/.test(h) && /property="og:image"/.test(h));
  t(`${pre} all <img> have alt attribute`, ![...h.matchAll(/<img\b[^>]*>/g)].some((m) => !/\salt=/.test(m[0])));
  // JSON-LD
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } });
  t(`${pre} all JSON-LD parses`, lds.every(Boolean));
  const flat = lds.filter(Boolean).flat();
  const types = flat.map((x) => x["@type"]);
  if (p !== "/") t(`${pre} has BreadcrumbList`, types.includes("BreadcrumbList"));
  const crumb = flat.find((x) => x["@type"] === "BreadcrumbList");
  if (crumb) t(`${pre} breadcrumb last item = this page`, crumb.itemListElement.at(-1).item === SITE + p || !crumb.itemListElement.at(-1).item || p === "/", JSON.stringify(crumb.itemListElement.at(-1)));
  const body = textOf(h);
  const lb = flat.find((x) => x["@type"] === "LocalBusiness");
  if (lb) {
    t(`${pre} LocalBusiness: name/address/url, name visible`, !!lb.name && !!lb.address?.addressLocality && !!lb.url && body.includes(lb.name));
    if (lb.aggregateRating) t(`${pre} aggregateRating matches visible rating + reviews`, body.includes(lb.aggregateRating.ratingValue.toFixed(1)) && lb.review?.length >= 1);
    if (lb.openingHoursSpecification) t(`${pre} opening hours in schema also visible`, lb.openingHoursSpecification.every((o) => body.includes(`${o.opens}-${o.closes}`)));
    if (lb.telephone) t(`${pre} telephone in schema is visible`, body.replace(/\s/g, "").includes(lb.telephone.replace(/\s/g, "")));
  }
  const coll = flat.find((x) => x["@type"] === "CollectionPage");
  if (coll) {
    const names = coll.mainEntity.itemListElement.map((i) => i.name);
    t(`${pre} ItemList items all visible on the page, count matches`, names.length === coll.mainEntity.numberOfItems && names.every((n) => body.includes(n)));
  }
  const art = flat.find((x) => ["Article", "NewsArticle"].includes(x["@type"]));
  if (art) t(`${pre} Article: headline/date/author/publisher (+image if hero)`, !!art.headline && !!art.datePublished && !!art.author?.name && !!art.publisher?.name && (!/<figure/.test(h) || !!art.image));
  // internal links
  for (const m of h.matchAll(/<a\b[^>]*\shref="(\/[^"#?]*)"/g)) seenLinks.add(m[1]);
}
t("no empty-string titles/descriptions anywhere", ![...titles.keys()].includes("") && ![...descs.keys()].includes(""));

// ---------------- internal link health ----------------
const broken = [];
for (const l of [...seenLinks].filter((x) => !/^\/(admin|owner|_next)/.test(x))) {
  let r = await get(l); let hops = 0;
  while ([301, 302, 307, 308].includes(r.status) && hops++ < 4) r = await get(new URL(r.headers.get("location"), BASE).pathname);
  if (r.status !== 200) broken.push(`${l} → ${r.status}`);
}
t(`internal links resolve (${seenLinks.size} unique links checked)`, broken.length === 0, broken.slice(0, 8).join(", "));
const aliasLinks = [];
for (const u of urls.slice(0, 40)) { const h = await (await get(new URL(u.loc).pathname)).text(); if (/href="\/categories\/[a-z-]+"/.test(h)) aliasLinks.push(u.loc); }
t("no internal links point at the redirecting /categories/{slug} alias", aliasLinks.length === 0, aliasLinks.join(", "));

// ---------------- redirects ----------------
let r = await get("/seo-fx-old-page");
t("redirect: manual redirect is permanent (308)", r.status === 308 && new URL(r.headers.get("location"), BASE).pathname === "/locations/hackney");
r = await get("/seo-fx-old-chain");
t("redirect: chain resolves straight to final destination in one hop", r.status === 308 && new URL(r.headers.get("location"), BASE).pathname === "/locations/hackney");
r = await get("/categories/cleaning");
t("redirect: /categories/{slug} → canonical category page (308)", r.status === 308 && new URL(r.headers.get("location"), BASE).pathname === "/businesses/london/cleaning");
r = await get("/businesses/london/cafes/" + rated.slug);
t("redirect: wrong category in profile URL → canonical profile (308)", r.status === 308 && new URL(r.headers.get("location"), BASE).pathname === bizPath(rated));
const hitRow = await db.redirect.findUnique({ where: { fromPath: "/seo-fx-old-page" } });
t("redirect: hit counter increments", hitRow.hits >= 1);
r = await get("/this/does/not/exist");
t("unknown URL → real 404 (not a soft 404)", r.status === 404 && robotsOf(await r.text()).includes("noindex"));

// ---------------- podcast feed ----------------
const podFeed = await get("/podcast/feed.xml"); const pf = await podFeed.text();
t("podcast feed: valid structure, iTunes tags, only complete real episodes", podFeed.status === 200 && pf.includes("<itunes:author>") && pf.includes("<itunes:category") && pf.includes("seo-fx-ep-1") && pf.includes("<enclosure") && !pf.includes("inside-the-business-removals") && (pf.match(/<item>/g) ?? []).length === (pf.match(/<\/item>/g) ?? []).length);
t("podcast feed: episodes have transcript + chapters resources that resolve", (await get("/podcast/seo-fx-ep-1/transcript.txt")).status === 200 && (await get("/podcast/seo-fx-ep-1/chapters.json")).status === 200);
const epPage = await (await get("/podcast/seo-fx-ep-1")).text();
const epLd = [...epPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).flat();
t("episode page: PodcastEpisode + VideoObject schema present and consistent", epLd.some((x) => x["@type"] === "PodcastEpisode" && x.hasPart?.length === 2) && epLd.some((x) => x["@type"] === "VideoObject" && x.embedUrl));
t("episode page: no third-party video requests embedded server-side (click-to-load)", !/<iframe/.test(epPage) && !/ytimg\.com/.test(epPage.replace(/<script[\s\S]*?<\/script>/g, "")));

// ---------------- robots + OG ----------------
const robots = await (await get("/robots.txt")).text();
t("robots.txt: sitemap index declared, admin/owner/review-links disallowed", robots.includes("/sitemap.xml") && robots.includes("Disallow: /admin") && robots.includes("Disallow: /owner") && robots.includes("/reviews/manage"));
for (const p of ["/opengraph-image", "/news/seo-fx-news/opengraph-image", bizPath(rated) + "/opengraph-image"]) { const x = await get(p); const b = Buffer.from(await x.arrayBuffer()); t(`og image renders: ${p}`, x.status === 200 && x.headers.get("content-type") === "image/png" && b.length > 3000 && b.subarray(1, 4).toString() === "PNG"); }
r = await get("/feed.xml"); const feed = await r.text();
t("RSS feed: valid, real articles only", r.status === 200 && feed.includes("<rss") && feed.includes("seo-fx-news") && !feed.includes("a-wood-fired"));

await wipe(); await db.$disconnect();
console.log(`\n${fail ? fail + " FAILED" : "SEO AUDIT PASSED"} (${warn} warnings, ${urls.length} indexable URLs crawled)`);
process.exit(fail ? 1 : 0);
