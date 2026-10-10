// Accessibility (axe-core) + responsive overflow audit. Run against `next start -p 3417` with a seeded DB.
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3417";
const axeSrc = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const PW = readFileSync(".env", "utf8").match(/ADMIN_PASSWORD="(.*)"/)[1];
const ADMIN_EMAIL = readFileSync(".env", "utf8").match(/ADMIN_EMAIL="(.*)"/)[1];
const db = new PrismaClient();
const sh = (x) => createHash("sha256").update(x).digest("hex");
const firstArticle = await db.article.findFirst();

// ---- fixtures -------------------------------------------------------------
const [city, loc, cat] = [await db.city.findFirst(), await db.location.findFirst(), await db.category.findFirst()];
async function wipe() {
  const ids = (await db.business.findMany({ where: { slug: { startsWith: "a11y-fixture" } }, select: { id: true } })).map((b) => b.id);
  await db.review.deleteMany({ where: { businessId: { in: ids } } }); await db.claimRequest.deleteMany({ where: { businessId: { in: ids } } });
  await db.businessOwner.deleteMany({ where: { businessId: { in: ids } } }); await db.business.deleteMany({ where: { id: { in: ids } } });
  await db.owner.deleteMany({ where: { email: "owner@a11y.example" } }); await db.emailOutbox.deleteMany();
  await db.podcastEpisode.deleteMany({ where: { slug: { startsWith: "a11y-ep" } } });
  await db.newsletterIssue.deleteMany({ where: { subject: { startsWith: "A11y issue" } } });
  await db.newsletterSubscriber.deleteMany({ where: { email: { endsWith: "@a11y.example" } } });
}
await wipe();
const mkBiz = (slug, name, extra = {}) => db.business.create({ data: { slug, name, summary: "Fixture business for audits.", description: "A fixture description with enough words to look like a real profile for the audit.", cityId: city.id, locationId: loc.id, categoryId: cat.id, isSample: false, phone: "020 7946 0000", ...extra } });
const fx = await mkBiz("a11y-fixture", "A11y Fixture Cafe", { claimStatus: "VERIFIED", ratingAvg: 4.5, ratingCount: 2, instagram: "https://instagram.com/fixture", openingHours: '{"mon":"09:00-17:00"}', services: '["a","b","c"]', ownerUpdatedAt: new Date() });
const fx2 = await mkBiz("a11y-fixture-2", "A11y Fixture Two", { claimStatus: "PENDING", websiteHost: "fixture2.example" });
const mk = (n, rating, status, extra = {}) => db.review.create({ data: { businessId: fx.id, authorName: "Reviewer " + n, authorEmail: "r" + n + "@example.com", authorEmailHash: sh("r" + n), rating, title: "Title " + n, body: "A genuinely written review body number " + n + " with enough text.", status, tokenHash: sh("tok" + n), bodyHash: "b" + n, flags: n === 3 ? "contains-link" : null, ...extra } });
await mk(1, 5, "PUBLISHED", { response: "Thanks so much for the lovely review!", respondedAt: new Date() }); await mk(2, 4, "PUBLISHED"); await mk(3, 3, "PENDING"); await mk(4, 2, "HELD");
const rep = await db.review.findFirst({ where: { businessId: fx.id, status: "PUBLISHED" } });
await db.reviewReport.create({ data: { reviewId: rep.id, reason: "SPAM", reporterKey: "k1" } });
await db.emailOutbox.create({ data: { to: "r3@example.com", subject: "Fixture", body: "Hello" } });
const owner = await db.owner.create({ data: { email: "owner@a11y.example", name: "Olive Owner" } });
await db.businessOwner.create({ data: { ownerId: owner.id, businessId: fx.id } });
await db.claimRequest.create({ data: { businessId: fx2.id, name: "Cleo Claimant", email: "cleo@fixture2.example", phone: "+44 20 7946 0001", role: "Director", relationship: "director", verification: "I am the director of this business.", tokenHash: sh("a11y-claim-tok"), domainMatch: true, emailVerifiedAt: new Date(), phoneCodeHash: sh("x"), phoneCodeSetAt: new Date(), status: "NEEDS_INFO", adminNotes: "Please send your Companies House number." } });
await db.claimRequest.create({ data: { kind: "DISPUTE", businessId: fx.id, name: "Dana Disputer", email: "dana@example.com", phone: "-", role: "Former employee", relationship: "other", verification: "The claimant left the company years ago and has no authority here.", tokenHash: sh("a11y-disp-tok") } });
await db.profileChangeRequest.create({ data: { businessId: fx.id, ownerId: owner.id, message: "Please rename us to A11y Fixture Coffee." } });
await db.coverageRequest.create({ data: { businessId: fx.id, ownerId: owner.id, topic: "We now roast our own beans", details: "A story about starting to roast on site last spring and supplying two local cafes." } });
await db.businessEditLog.create({ data: { businessId: fx.id, ownerId: owner.id, changes: JSON.stringify({ summary: { from: "Old summary", to: "Fixture business for audits." } }) } });
const epx = await db.podcastEpisode.create({ data: { slug: "a11y-ep", number: 9100, season: 1, title: "A11y episode: how a van became a company", description: "A fixture episode with audio, video, chapters, a transcript and highlights, used to audit the player and page.", showNotes: "## Notes\n\nSome show notes with a [link](https://example.com).\n\n- One\n- Two", transcript: "Sam: Hello and welcome.\nSarah: Thanks for having me. " + "More words in the transcript. ".repeat(10), chapters: JSON.stringify([{ t: 0, title: "Welcome" }, { t: 310, title: "The first van" }, { t: 1125, title: "The turning point" }]), audioUrl: "https://cdn.example/a11y.mp3", audioBytes: 5000000, durationSec: 1930, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", guestName: "Sarah Jones", guestRole: "Founder", status: "PUBLISHED", publishedAt: new Date(Date.now() - 86400000), isSample: false, businessId: fx.id } });
await db.episodeClip.create({ data: { episodeId: epx.id, kind: "QUOTE", quote: "Be reliable above everything else, and ask every customer for a review.", speaker: "Sarah Jones", startSec: 1685 } });
await db.episodeClip.create({ data: { episodeId: epx.id, kind: "CLIP", title: "The first van", startSec: 310, endSec: 365, note: "Vertical" } });
const nlIssue = await db.newsletterIssue.create({ data: { subject: "A11y issue: weekly digest", body: "Hello,\n\nSome news.\n\n{{unsubscribe}}" } });
await db.newsletterSubscriber.create({ data: { email: "reader@a11y.example", status: "ACTIVE", confirmedAt: new Date(), source: "footer" } });
const inviteTok = randomBytes(12).toString("base64url");
await db.teamInvite.deleteMany({ where: { email: "mate@a11y.example" } });
await db.teamInvite.create({ data: { businessId: fx.id, email: "mate@a11y.example", invitedBy: "owner@a11y.example", tokenHash: sh(inviteTok), expiresAt: new Date(Date.now() + 7 * 86400_000) } });
const linkTok = randomBytes(12).toString("base64url");
await db.ownerLoginToken.create({ data: { ownerId: owner.id, tokenHash: sh(linkTok), expiresAt: new Date(Date.now() + 3600_000) } });

const pub = ["/", "/businesses", "/businesses/submit", "/businesses/london", "/businesses/london/cleaning/brightwell-cleaning-co", "/locations", "/locations/hackney", "/categories", "/news", "/news/a-wood-fired-restaurant-opens-its-doors-on-a-hackney-side-street", "/stories", "/podcast", "/podcast/inside-the-business-removals-newham", "/claim", "/about", "/brand", "/admin/login", "/authors/primestreet-editorial",
  `/businesses/london/${cat.slug}/a11y-fixture`, "/review/a11y-fixture", "/reviews/manage/tok3", "/businesses?rating=4&sort=rating",
  "/claim/status/a11y-claim-tok", "/claim/status/a11y-disp-tok", "/claim/dispute?business=a11y-fixture", "/owner/login", `/owner/login/${linkTok}`, "/locations/hackney/cleaning", "/businesses/london/cleaning", "/podcast/a11y-ep", "/podcast?format=video", "/search", "/search?q=cleaning", "/search?q=claening", "/search?q=zzzqqq", "/search?postcode=E8%203AA", "/saved", "/privacy", "/newsletter/confirm/sometoken", "/newsletter/unsubscribe/some.token", `/owner/team/${inviteTok}`, "/owner/team/not-a-real-token"];
const admin = ["/admin", "/admin/articles", "/admin/articles/new", `/admin/articles/${firstArticle.id}`, `/admin/articles/${firstArticle.id}/preview`, "/admin/authors", "/admin/authors/new", "/admin/claims", "/admin/claims?show=all", "/admin/owner-inbox", `/admin/businesses/${fx.id}`, "/admin/submissions", "/admin/businesses", "/admin/import", "/admin/reviews?tab=pending", "/admin/reviews?tab=published", "/admin/reviews?tab=reported", "/admin/reviews?tab=held", "/admin/outbox", "/admin/seo", "/admin/seo?status=noindex", `/admin/seo/edit?path=${encodeURIComponent("/locations/hackney")}`, "/admin/seo/redirects", "/admin/podcast", "/admin/podcast/new", `/admin/podcast/${epx.id}`, "/admin/podcast/show", "/admin/search", "/admin/newsletter", `/admin/newsletter/${nlIssue.id}`,
  "/admin/automations", "/admin/money", "/admin/corrections", "/admin/audit", "/admin/moderation", "/admin/settings", "/admin/commissions", "/admin/payments"];
const ownerPages = ["/owner", `/owner/business/${fx.id}`, `/owner/business/${fx.id}/reviews`, `/owner/business/${fx.id}/coverage`,
  `/owner/business/${fx.id}/insights`, `/owner/business/${fx.id}/photos`, `/owner/business/${fx.id}/offers`, `/owner/business/${fx.id}/billing`,
  `/owner/business/${fx.id}/team`, `/owner/business/${fx.id}/hours`, "/owner/help"];

const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
let bad = 0;
for (const w of [375, 768, 1280]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 900, isMobile: w < 768, deviceScaleFactor: 1 });
  await page.goto(BASE + "/admin/login"); await page.type("#email", ADMIN_EMAIL); await page.type("#password", PW);
  await Promise.all([page.click('form:has(#password) button'), page.waitForFunction(() => location.pathname === "/admin")]);
  // owner session (separate cookie) via a DB-issued one-time link
  const raw = randomBytes(12).toString("base64url");
  await db.ownerLoginToken.create({ data: { ownerId: owner.id, tokenHash: sh(raw), expiresAt: new Date(Date.now() + 3600_000) } });
  await page.goto(`${BASE}/owner/login/${raw}`, { waitUntil: "networkidle0" });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText === "Sign in").click());
  await page.waitForFunction(() => location.pathname === "/owner", { timeout: 8000 });
  for (const path of [...pub, ...admin, ...ownerPages]) {
    await page.goto(BASE + path, { waitUntil: "networkidle0" });
    // Does the PAGE actually scroll sideways? documentElement.scrollWidth is inflated by any wide child inside a
    // horizontally scrollable container (a responsive table is meant to scroll), which reports overflow that no
    // user can see. Attempting the scroll and reading scrollX is the real test.
    const overflow = await page.evaluate(() => {
      const cw = document.documentElement.clientWidth;
      window.scrollTo(9999, 0);
      const x = window.scrollX;
      window.scrollTo(0, 0);
      return Math.max(x, document.body.scrollWidth - cw);
    });
    if (overflow > 1) {
      bad++;
      const who = await page.evaluate((cw) => { const out = []; const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = wk.nextNode())) { const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.right > cw + 1) { out.push(`${n.parentElement.tagName}.${String(n.parentElement.className).slice(0, 40)}:"${n.textContent.trim().slice(0, 30)}"`); break; } } return out.slice(0, 3); }, w);
      console.log(`OVERFLOW ${w}px ${path} (+${overflow}px) ${who.join(" | ")}`);
    }
    if (w !== 768) {
      await page.evaluate(axeSrc);
      const res = await page.evaluate(async () => (await axe.run({ runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes[0].target.join(" "), help: v.help })));
      for (const v of res) { bad++; console.log(`AXE ${w}px ${path}: [${v.impact}] ${v.id} x${v.n} — ${v.help} — e.g. ${v.ex}`); }
    }
  }
  await page.close();
}
await browser.close();
await wipe(); await db.$disconnect();
console.log(bad ? `${bad} issues` : "CLEAN: no overflow, no axe violations"); process.exit(bad ? 1 : 0);
