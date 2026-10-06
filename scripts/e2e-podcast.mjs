// Podcast + video end-to-end tests. Run against `next start` (BASE env) with a seeded DB.
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
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
await page.setUserAgent(HUMAN);
const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle0" });
const text = () => page.evaluate(() => document.body.innerText);
const setv = (sel, v) => page.$eval(sel, (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, v);
const click = async (label, scope) => { await page.evaluate((l, sc) => { const root = sc ? [...document.querySelectorAll("li,div")].find((x) => x.innerText.includes(sc)) : document; const b = [...root.querySelectorAll("button,a")].find((x) => x.innerText.trim() === l); if (!b) throw new Error("no " + l); b.click(); }, label, scope); await sleep(1700); };
const status = async (p, o = {}) => (await fetch(BASE + p, { redirect: "manual", headers: { "user-agent": HUMAN }, ...o })).status;
const sitemapPaths = async () => { const idx = await (await fetch(BASE + "/sitemap.xml")).text(); const out = []; for (const m of idx.matchAll(/<loc>([^<]+)<\/loc>/g)) { const x = await (await fetch(BASE + new URL(m[1]).pathname)).text(); for (const u of x.matchAll(/<loc>([^<]+)<\/loc>/g)) out.push(new URL(u[1]).pathname); } return out; };
const robotsOf = async (p) => ((await (await fetch(BASE + p)).text()).match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? "");

const TRANSCRIPT = ["Sam: Welcome to the PrimeStreet Podcast. Sarah, how did you start the business?", "Sarah Jones: I started with one van, a mop bucket and a list of five customers in Hackney.", "It was exhausting, but we were profitable by month three.", "Sam: What was the turning point?", "Sarah Jones: Winning our first office contract. That gave us predictable income and let us hire our first full-time cleaner.", "Sam: What would you tell someone starting today?", "Sarah Jones: Be reliable above everything else, and ask every customer for a review."].join("\n");
const NOTES = "## In this episode\n\nSarah Jones explains how a one-van cleaning round became a twenty-person company serving homes and offices across East London.\n\n- Why reliability beats price\n- Hiring the first full-time cleaner\n- Asking for reviews\n\nLinks: [Brightwell](https://example.com) and more detail on how the business grew from a single van.";
const cleanup = async () => {
  await db.podcastEpisode.deleteMany({ where: { slug: { startsWith: "e2e-pod-" } } });
  await db.articleBusiness.deleteMany({ where: { article: { title: { startsWith: "E2E Pod" } } } });
  await db.article.deleteMany({ where: { title: { startsWith: "E2E Pod" } } });
  await db.redirect.deleteMany({ where: { fromPath: { startsWith: "/podcast/e2e-pod-" } } });
  await db.podcastShow.deleteMany(); await db.auditLog.deleteMany({ where: { OR: [{ targetType: "PodcastEpisode" }, { targetType: "PodcastShow" }] } });
};
await cleanup();

// ---- auth + show settings
t("podcast admin requires login", [302, 307, 308].includes(await status("/admin/podcast")));
await go("/admin/login"); await page.type("#email", ADMIN_EMAIL); await page.type("#password", PW);
await Promise.all([page.click('form:has(#password) button'), page.waitForFunction(() => location.pathname === "/admin")]);
await go("/admin/podcast/show");
await setv("#ownerEmail", "not-an-email"); await setv("#description", "short"); await setv("#spotifyUrl", "javascript:alert(1)"); await click("Save show settings");
let tx = await text();
t("show settings validation: email, description, URL", tx.includes("valid email") && tx.includes("at least 20 characters") && tx.includes("valid http(s)"));
await go("/admin/podcast/show");
await setv("#ownerEmail", ADMIN_EMAIL); await setv("#spotifyUrl", "https://open.spotify.com/show/e2e"); await setv("#appleUrl", "https://podcasts.apple.com/gb/podcast/e2e/id1"); await click("Save show settings");
t("show settings saved", (await text()).includes("Saved.") && (await db.podcastShow.findUnique({ where: { id: "main" } }))?.ownerEmail === ADMIN_EMAIL);

// ---- new episode: validation
await go("/admin/podcast/new");
t("episode number pre-filled (next number)", Number(await page.$eval("#number", (e) => e.value)) >= 2);
await setv("#title", "E2E Pod Episode: How a van became a company");
t("slug auto-generated", (await page.$eval("#slug", (e) => e.value)) === "e2e-pod-episode-how-a-van-became-a-company");
await setv("#slug", "e2e-pod-episode"); await setv("#number", "9001");
await setv("#description", "short"); await setv("#audioUrl", "http://insecure.example/a.mp3"); await setv("#videoUrl", "https://evil.example/v"); await setv("#chaptersText", "nonsense");
await click("Publish now");
tx = await text();
t("validation: description, insecure audio, bad video, bad chapters", tx.includes("at least 50 characters") && tx.includes("public https link") && tx.includes("YouTube or Vimeo") && tx.includes("12:30 Title"));
t("typed values preserved after error", (await page.$eval("#title", (e) => e.value)).startsWith("E2E Pod") && (await page.$eval("#audioUrl", (e) => e.value)) === "http://insecure.example/a.mp3");
t("nothing saved on error", (await db.podcastEpisode.count({ where: { slug: "e2e-pod-episode" } })) === 0);
// probe: in production, private/loopback targets are refused
await setv("#audioUrl", "http://127.0.0.1:9/x.mp3"); await click("Check file");
t("'Check file' refuses private/non-https addresses (SSRF guard)", (await text()).includes("public https address"));

// ---- fill a valid draft
await setv("#description", "Sarah Jones tells how a one-van cleaning round became a twenty-person company serving East London homes and offices.");
await setv("#audioUrl", "https://cdn.example/e2e-episode.mp3"); await setv("#audioBytes", "23456789"); await setv("#durationText", "32:10");
await setv("#videoUrl", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
t("video provider detected live in the editor", (await text()).includes("Detected: youtube"));
await setv("#imageUrl", "https://cdn.example/e2e-cover.jpg");
await setv("#showNotes", NOTES); await setv("#transcript", TRANSCRIPT);
await setv("#chaptersText", "00:00 Welcome\n05:10 The first van\n18:45 The turning point");
t("chapters parsed live", (await text()).includes("3 chapters"));
await setv("#guestName", "Sarah Jones"); await setv("#guestRole", "Founder, Brightwell Cleaning");
await page.type("#bq", "Brightwell");
await page.waitForFunction(() => [...document.querySelectorAll("li button")].some((b) => b.innerText.includes("Brightwell")), { timeout: 6000 });
await click("Brightwell Cleaning Co Cleaning · Hackney");
t("business picker links a business", (await text()).includes("Brightwell Cleaning Co"));
t("publish checklist all ticked", !(await page.evaluate(() => [...document.querySelectorAll("li")].filter((l) => l.innerText.startsWith("○")).map((l) => l.innerText).join("|"))));
await click("Save draft");
let ep = await db.podcastEpisode.findUnique({ where: { slug: "e2e-pod-episode" } });
t("draft saved (not public, not scheduled)", !!ep && ep.status === "DRAFT" && ep.publishedAt === null && ep.isSample === false && ep.durationSec === 1930 && ep.audioBytes === 23456789 && JSON.parse(ep.chapters).length === 3);
t("draft is 404 publicly and absent from feed, list and sitemap", (await status("/podcast/e2e-pod-episode")) === 404 && !(await (await fetch(BASE + "/podcast/feed.xml")).text()).includes("e2e-pod-episode") && !(await (await fetch(BASE + "/podcast")).text()).includes("E2E Pod Episode") && !(await sitemapPaths()).includes("/podcast/e2e-pod-episode"));
t("draft transcript/chapters resources are 404", (await status("/podcast/e2e-pod-episode/transcript.txt")) === 404 && (await status("/podcast/e2e-pod-episode/chapters.json")) === 404);
t("draft doesn't leak on the business profile", !(await (await fetch(BASE + "/businesses/london/cleaning/brightwell-cleaning-co")).text()).includes("E2E Pod Episode"));

// ---- quotes + clips (draft)
await go(`/admin/podcast/${ep.id}`);
await setv("#QUOTE-quote", "Too short"); await click("Add quote");
t("quote validation (min length)", (await text()).includes("at least 10 characters"));
await go(`/admin/podcast/${ep.id}`);
await setv("#QUOTE-quote", "Be reliable above everything else, and ask every customer for a review."); await setv("#QUOTE-start", "28:05"); await click("Add quote");
const quote = await db.episodeClip.findFirst({ where: { episodeId: ep.id, kind: "QUOTE" } });
t("quote saved with speaker default + time", quote?.speaker === "Sarah Jones" && quote.startSec === 1685);
const qimg = await fetch(`${BASE}/podcast/e2e-pod-episode/quote/${quote.id}`, { headers: { cookie: (await page.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } });
const qbuf = Buffer.from(await qimg.arrayBuffer());
t("admin can preview the quote card of a DRAFT episode (PNG)", qimg.status === 200 && qimg.headers.get("content-type") === "image/png" && qbuf.subarray(1, 4).toString() === "PNG" && qbuf.length > 3000);
t("public cannot see a draft episode's quote card", (await status(`/podcast/e2e-pod-episode/quote/${quote.id}`)) === 404);
await go(`/admin/podcast/${ep.id}`);
await setv("#CLIP-title", "The first van"); await setv("#CLIP-start", "05:10"); await setv("#CLIP-end", "04:00"); await click("Add clip");
t("clip validation: end must be after start", (await text()).includes("End must be after start"));
await go(`/admin/podcast/${ep.id}`);
await setv("#CLIP-title", "The first van"); await setv("#CLIP-start", "05:10"); await setv("#CLIP-end", "06:05"); await setv("#CLIP-note", "Vertical 9:16 for Reels"); await click("Add clip");
await go(`/admin/podcast/${ep.id}`);
t("clip listed with times and note", (await text()).includes("The first van") && (await text()).includes("5:10–6:05"));
await click("Mark done", "The first van");
t("clip can be marked done", (await db.episodeClip.findFirst({ where: { episodeId: ep.id, kind: "CLIP" } })).status === "DONE");
t("copy kit generated (newsletter + 3 captions with the episode link)", (await page.$$("textarea[readonly]")).length === 4 && (await page.$eval("#copy-social-caption-1", (e) => e.value)).includes("/podcast/e2e-pod-episode"));

// ---- repurpose: written interview from transcript
const author = await db.author.findFirst();
await click("Create draft from transcript");
t("redirected to the article editor with the draft", page.url().includes("/admin/articles/") && (await text()).includes("Draft created from the transcript"));
const art = await db.article.findFirst({ where: { episode: { id: ep.id } }, include: { businesses: true } });
t("article draft: INTERVIEW, editorial, linked to episode + business", art?.type === "INTERVIEW" && art.status === "DRAFT" && art.disclosure === "EDITORIAL" && art.businesses.length === 1);
t("article body is a Q&A built from the transcript", art.body.includes("## Welcome to the PrimeStreet Podcast") && art.body.includes("one van, a mop bucket") && art.body.includes("## What was the turning point?") && art.body.includes("/podcast/e2e-pod-episode") && !art.body.includes("Sarah Jones:"));
await go(`/admin/podcast/${ep.id}`);
t("second attempt shows the linked article instead of a second draft", (await text()).includes("Linked article:") && (await db.article.count({ where: { episode: { id: ep.id } } })) === 1);

// ---- publish
await go(`/admin/podcast/${ep.id}`);
await click("Publish now");
ep = await db.podcastEpisode.findUnique({ where: { id: ep.id } });
t("published with timestamp", ep.status === "PUBLISHED" && ep.publishedAt <= new Date());

// ---- public page (tracking resource loads for privacy)
const reqs = [];
page.on("request", (r) => reqs.push(r.url()));
await go("/podcast/e2e-pod-episode");
const body = await text();
t("page: title, guest, duration, show notes, highlight quote", body.includes("E2E Pod Episode") && body.includes("With Sarah Jones") && body.includes("32:10") && body.includes("In this episode") && body.includes("Be reliable above everything else"));
t("player: native <audio controls> with the source + type, download link", await page.evaluate(() => { const a = document.querySelector("audio"); const s = a?.querySelector("source"); return !!a && a.controls && s.src === "https://cdn.example/e2e-episode.mp3" && s.type === "audio/mpeg" && a.preload === "none"; }));
t("chapters listed as buttons with accessible labels", await page.evaluate(() => { const b = [...document.querySelectorAll('nav[aria-label="Chapters"] button')]; return b.length === 3 && b[1].getAttribute("aria-label") === "Jump to 5:10: The first van"; }));
await page.select('select[id^="rate-"]', "1.5");
t("speed control changes playbackRate", (await page.evaluate(() => document.querySelector("audio").playbackRate)) === 1.5);
t("privacy: NOTHING requested from YouTube/Vimeo/ytimg before the user presses play", !reqs.some((u) => /youtube|ytimg|vimeo|googlevideo/.test(u)) && (await page.$("iframe")) === null);
await page.click('button[aria-label^="Play video"]'); await sleep(1200);
t("click-to-load: privacy-enhanced iframe appears only after the click", await page.evaluate(() => { const f = document.querySelector("iframe"); return !!f && f.src.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ") && !!f.title; }));
t("transcript available in a disclosure", await page.evaluate(() => { const d = document.querySelector('section[aria-labelledby="transcript"] details'); return !!d && d.textContent.includes("Winning our first office contract"); }));
const ld = (await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)))).flat();
const pe = ld.find((x) => x["@type"] === "PodcastEpisode"), vo = ld.find((x) => x["@type"] === "VideoObject");
t("JSON-LD PodcastEpisode: series, number, audio object, ISO duration, chapter Clips", pe?.episodeNumber === 9001 && pe.partOfSeries?.name === "The PrimeStreet Podcast" && pe.associatedMedia?.contentUrl === "https://cdn.example/e2e-episode.mp3" && pe.timeRequired === "PT32M10S" && pe.hasPart?.length === 3 && pe.hasPart[1].startOffset === 310 && pe.hasPart[1].endOffset === 1125);
t("JSON-LD VideoObject: embedUrl, duration, thumbnail, upload date", vo?.embedUrl?.includes("youtube-nocookie.com/embed/dQw4w9WgXcQ") && vo.duration === "PT32M10S" && !!vo.thumbnailUrl && !!vo.uploadDate);
t("JSON-LD content visible: chapter titles and name appear on page", pe.hasPart.every((c) => body.includes(c.name)) && body.includes(pe.name));
t("indexable (transcript present): no noindex, in sitemap", !(await robotsOf("/podcast/e2e-pod-episode")).includes("noindex") && (await sitemapPaths()).includes("/podcast/e2e-pod-episode"));
const ogImg = await fetch(BASE + "/podcast/e2e-pod-episode/opengraph-image"); t("episode OG image renders", ogImg.status === 200 && ogImg.headers.get("content-type") === "image/png");
const quoteOk = await fetch(`${BASE}/podcast/e2e-pod-episode/quote/${quote.id}`);
t("quote card is public once the episode is live", quoteOk.status === 200 && quoteOk.headers.get("content-type") === "image/png");

// ---- resources: feed, transcript, chapters
const feedRes = await fetch(BASE + "/podcast/feed.xml"); const feed = await feedRes.text();
t("feed: RSS with iTunes + podcast namespaces and correct content type", feedRes.status === 200 && (feedRes.headers.get("content-type") ?? "").includes("application/rss+xml") && feed.includes("xmlns:itunes") && feed.includes("xmlns:podcast") && feed.startsWith("<?xml") && feed.trim().endsWith("</rss>"));
t("feed: show settings applied (owner email, spotify not leaked as tag)", feed.includes(`<itunes:email>${ADMIN_EMAIL}</itunes:email>`) && feed.includes("<itunes:author>PrimeStreet</itunes:author>"));
t("feed: episode enclosure with size + type, duration, number, transcript + chapters links", feed.includes('<enclosure url="https://cdn.example/e2e-episode.mp3" length="23456789" type="audio/mpeg"/>') && feed.includes("<itunes:duration>1930</itunes:duration>") && feed.includes("<itunes:episode>9001</itunes:episode>") && feed.includes("/podcast/e2e-pod-episode/transcript.txt") && feed.includes("/podcast/e2e-pod-episode/chapters.json"));
t("feed: sample episodes excluded", !feed.includes("inside-the-business-removals-newham"));
const etag = feedRes.headers.get("etag");
t("feed: ETag + conditional GET returns 304", !!etag && (await fetch(BASE + "/podcast/feed.xml", { headers: { "if-none-match": etag } })).status === 304);
const tr = await fetch(BASE + "/podcast/e2e-pod-episode/transcript.txt");
t("transcript.txt: text/plain with the transcript", tr.status === 200 && (tr.headers.get("content-type") ?? "").includes("text/plain") && (await tr.text()).includes("mop bucket"));
const cj = await fetch(BASE + "/podcast/e2e-pod-episode/chapters.json"); const cjson = await cj.json();
t("chapters.json: Podcasting 2.0 format", cj.status === 200 && cjson.version === "1.2.0" && cjson.chapters.length === 3 && cjson.chapters[1].startTime === 310 && cjson.chapters[1].title === "The first van");

// ---- index page
await go("/podcast");
t("index: lists the episode with video + transcript markers; listen links; RSS link", (await text()).includes("E2E Pod Episode") && (await text()).includes("▶ Video") && (await text()).includes("Spotify") && (await text()).includes("Apple Podcasts") && (await page.$('a[href="/podcast/feed.xml"]')) !== null);
t("index: RSS autodiscovery <link> in head", await page.evaluate(() => !!document.querySelector('link[rel="alternate"][type="application/rss+xml"][href*="/podcast/feed.xml"]')));
await go("/podcast?format=video"); t("format filter: video", (await text()).includes("E2E Pod Episode"));
await go("/podcast?format=audio"); t("format filter: audio", (await text()).includes("E2E Pod Episode"));
t("filtered index is noindex", (await robotsOf("/podcast?format=video")).includes("noindex"));
await go("/podcast"); const pld = (await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)))).flat();
t("index JSON-LD: PodcastSeries with webFeed", pld.some((x) => x["@type"] === "PodcastSeries" && x.webFeed?.endsWith("/podcast/feed.xml")));
await go("/businesses/london/cleaning/brightwell-cleaning-co");
t("business profile shows the live episode", (await text()).includes("E2E Pod Episode"));

// ---- thin episode: no transcript/notes → noindex + out of sitemap
await db.podcastEpisode.create({ data: { slug: "e2e-pod-thin", number: 9002, title: "E2E Pod thin episode", description: "A short audio-only episode with no transcript and no show notes at all, for the thin-page rule.", audioUrl: "https://cdn.example/thin.mp3", audioBytes: 1000, durationSec: 60, status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000), isSample: false } });
t("thin episode (audio only): live but noindex and not in sitemap", (await status("/podcast/e2e-pod-thin")) === 200 && (await robotsOf("/podcast/e2e-pod-thin")).includes("noindex") && !(await sitemapPaths()).includes("/podcast/e2e-pod-thin"));

// ---- analytics: views + plays
const dayRows = async () => ({ views: (await db.episodeStat.aggregate({ where: { episodeId: ep.id }, _sum: { views: true } }))._sum.views ?? 0, plays: await db.episodePlay.count({ where: { episodeId: ep.id } }) });
let before = await dayRows();
await fetch(BASE + "/podcast/e2e-pod-episode", { headers: { "user-agent": HUMAN } });
await fetch(BASE + "/podcast/e2e-pod-episode", { headers: { "user-agent": "Googlebot/2.1" } });
await fetch(BASE + "/podcast/e2e-pod-episode", { headers: { "user-agent": "python-requests/2" } });
t("views: human +1, bots ignored", (await dayRows()).views - before.views === 1);
const beacon = (body, h = {}) => fetch(BASE + "/api/podcast/play", { method: "POST", headers: { "content-type": "application/json", "user-agent": HUMAN, ...h }, body: typeof body === "string" ? body : JSON.stringify(body) });
before = await dayRows();
t("play beacon answers 204", (await beacon({ slug: "e2e-pod-episode" })).status === 204);
t("plays: first play counted", (await dayRows()).plays - before.plays === 1);
await beacon({ slug: "e2e-pod-episode" }); await beacon({ slug: "e2e-pod-episode" });
t("plays: same visitor/episode/day is deduplicated", (await dayRows()).plays - before.plays === 1);
await beacon({ slug: "e2e-pod-episode" }, { "user-agent": "Googlebot/2.1" });
await beacon({ slug: "nope" }); await beacon("not json"); await beacon({ slug: 5 }); await beacon({ slug: "e2e-pod-episode" }, { origin: "https://evil.example" });
t("plays: bots, unknown slug, bad JSON, wrong type and foreign origin all ignored (still 204)", (await dayRows()).plays - before.plays === 1);
t("play beacon rejects GET", (await fetch(BASE + "/api/podcast/play")).status === 405);
await db.episodePlay.deleteMany({ where: { episodeId: ep.id } });
await go("/podcast/e2e-pod-episode");
await page.evaluate(() => document.querySelector("audio").dispatchEvent(new Event("play")));
await sleep(1200);
t("UI wiring: pressing play sends the beacon once", (await db.episodePlay.count({ where: { episodeId: ep.id } })) === 1);
await go("/admin/podcast");
t("admin list shows views + plays columns with counts", (await text()).includes("Views (30d)") && (await page.evaluate(() => { const r = [...document.querySelectorAll("tr")].find((x) => x.innerText.includes("E2E Pod Episode")); return /\b1\b/.test(r.innerText); })));

// ---- slug change → redirect; article link public
await go(`/admin/podcast/${ep.id}`);
await setv("#slug", "e2e-pod-episode-renamed"); await click("Save changes");
const rr = await fetch(BASE + "/podcast/e2e-pod-episode", { redirect: "manual" });
t("slug change on a live episode → old URL 308 to the new one", rr.status === 308 && new URL(rr.headers.get("location"), BASE).pathname === "/podcast/e2e-pod-episode-renamed");
t("feed/sitemap use the new slug", (await (await fetch(BASE + "/podcast/feed.xml")).text()).includes("e2e-pod-episode-renamed") && (await sitemapPaths()).includes("/podcast/e2e-pod-episode-renamed"));
await db.article.update({ where: { id: art.id }, data: { status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000), standfirst: "x".repeat(60), authorId: author.id } });
await go("/podcast/e2e-pod-episode-renamed");
t("once the article is live the 'Prefer to read?' link appears", (await text()).toUpperCase().includes("PREFER TO READ?"));
await go(`/interviews/${art.slug}`);
t("article shows 'Also a podcast episode' link", (await text()).includes("Also a podcast episode"));

// ---- unpublish → gone; delete rules
await go(`/admin/podcast/${ep.id}`);
await click("Delete this episode");
t("live episode can't be deleted", (await db.podcastEpisode.count({ where: { id: ep.id } })) === 1);
await go(`/admin/podcast/${ep.id}`); await click("Unpublish");
t("unpublish: 404 publicly, removed from feed and sitemap", (await status("/podcast/e2e-pod-episode-renamed")) === 404 && !(await (await fetch(BASE + "/podcast/feed.xml")).text()).includes("e2e-pod-episode-renamed") && !(await sitemapPaths()).includes("/podcast/e2e-pod-episode-renamed"));
await db.podcastEpisode.deleteMany({ where: { slug: "e2e-pod-thin" } });

// ---- scheduling
await go("/admin/podcast/new");
await setv("#title", "E2E Pod scheduled episode"); await setv("#slug", "e2e-pod-sched"); await setv("#number", "9003");
await setv("#description", "A scheduled episode used to prove that future publish times keep the page hidden until the time arrives, for tests."); await setv("#videoUrl", "https://vimeo.com/123456789");
const f = new Date(Date.now() + 2 * 86400000), pad = (n) => String(n).padStart(2, "0");
await setv("#publishedAt", `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}T09:30`); await click("Schedule");
const sc = await db.podcastEpisode.findUnique({ where: { slug: "e2e-pod-sched" } });
t("video-only episode can be scheduled; hidden until its time", sc?.status === "PUBLISHED" && sc.publishedAt > new Date() && (await status("/podcast/e2e-pod-sched")) === 404 && !(await (await fetch(BASE + "/podcast")).text()).includes("scheduled episode"));
await db.podcastEpisode.update({ where: { id: sc.id }, data: { publishedAt: new Date(Date.now() - 1000) } });
await go("/podcast/e2e-pod-sched");
t("goes live automatically; Vimeo facade (no audio player)", (await text()).includes("Watch the video") && (await page.$("audio")) === null && (await text()).includes("Loads from Vimeo"));
t("video-only episode is excluded from the audio feed", !(await (await fetch(BASE + "/podcast/feed.xml")).text()).includes("e2e-pod-sched"));
await go("/admin/podcast"); t("audit log records episode changes", (await db.auditLog.count({ where: { targetType: "PodcastEpisode" } })) >= 5);

await cleanup(); await db.$disconnect(); await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PODCAST E2E PASSED"); process.exit(fail ? 1 : 0);
