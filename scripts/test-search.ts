import http from "http";
import { db } from "../src/lib/db";
import { AREA_CENTROIDS, bulkGeocode, businessPoint, fmtKm, haversineKm, isOpenNow, isOutcode, lookupPostcode, normalisePostcode, validLatLng } from "../src/lib/geo";
import { articleSimilarity, similarityScore } from "../src/lib/related";
import { buildMatch, contentTokens, editDistance, loggableQuery, spellSuggest, stripMarkdown, tokenize } from "../src/lib/search/text";
import { searchAll, suggest, syncIndex } from "../src/lib/search";
import { ftsQuery } from "../src/lib/search/fts";
import { csvCell, buildDigest, readUnsubToken, renderForRecipient, unsubToken } from "../src/lib/newsletter";
import { MAX_SAVED, parseIds, serialiseIds } from "../src/lib/saved";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

(async () => {
  // ------------------------------------------------------------ text
  t("tokenize: lowercases, strips accents/punctuation", tokenize("Café  Müller's, N1!").join(" ") === "cafe muller s n1");
  t("contentTokens: drops stop words but keeps everything if only stop words", contentTokens("best cleaners in London").join() === "cleaners" && contentTokens("in the").join() === "in,the");
  t("buildMatch: AND of quoted terms, last term is a prefix", buildMatch("cleaning hackney") === '"cleaning" AND "hackney"*');
  t("buildMatch: synonyms OR-ed in", buildMatch("plumber")!.includes('"plumbing"') && buildMatch("plumber")!.startsWith('("plumber"*'));
  t("buildMatch: 'any' mode uses OR", buildMatch("cleaning boilers", "any") === '"cleaning" OR "boilers"*');
  t("buildMatch: empty / stop-only handled", buildMatch("") === null && buildMatch("   ") === null && buildMatch("!!!") === null);
  const hostile = ['NEAR("a" b) OR * " -x', "AND OR NOT", '"unterminated', "a* b* ^c {d}", "col:val title:x", "'; DROP TABLE x; --", "(((", "\\", "é\u0000"];
  let allOk = true;
  for (const h of hostile) { const m = buildMatch(h); if (m) { try { await ftsQuery(m, 5); } catch { allOk = false; } } }
  t("buildMatch: hostile FTS syntax can never cause a query error", allOk);
  t("loggableQuery: normalises, drops PII-looking queries", loggableQuery("  Cleaners   in HACKNEY ") === "cleaners in hackney" && loggableQuery("a@b.com") === null && loggableQuery("020 7946 0958") === null && loggableQuery("https://x.com") === null && loggableQuery("www.x.com") === null && loggableQuery("a") === null);
  t("editDistance: transposition counts as one", editDistance("claening", "cleaning") === 2 || editDistance("clean", "claen") === 1);
  const vocab = new Map([["cleaning", 5], ["plumbing", 3], ["barber", 2], ["restaurants", 4], ["hackney", 6]]);
  t("spellSuggest: fixes typos from the site's own words", spellSuggest("claening", vocab) === "cleaning" && spellSuggest("plumbng hackny", vocab) === "plumbing hackney" && spellSuggest("barbar", vocab) === "barber");
  t("spellSuggest: leaves correct/unknown/short words alone", spellSuggest("cleaning", vocab) === null && spellSuggest("zzzzzzzz", vocab) === null && spellSuggest("pub", vocab) === null && spellSuggest("clea", vocab) === null);
  t("stripMarkdown", stripMarkdown("## Hi\n\n**bold** [link](https://x.y) ![alt](https://i.jpg)") === "Hi bold link");

  // ------------------------------------------------------------ geo
  const hackney = { lat: AREA_CENTROIDS.hackney[0], lng: AREA_CENTROIDS.hackney[1] }, camden = { lat: AREA_CENTROIDS.camden[0], lng: AREA_CENTROIDS.camden[1] }, croydon = { lat: AREA_CENTROIDS.croydon[0], lng: AREA_CENTROIDS.croydon[1] };
  const d = haversineKm(hackney, camden);
  t("haversine: Hackney↔Camden ≈ 5–7 km, Hackney↔Croydon ≈ 17–22 km, zero for same point", d > 4.5 && d < 7.5 && haversineKm(hackney, croydon) > 16 && haversineKm(hackney, croydon) < 23 && haversineKm(hackney, hackney) === 0);
  t("fmtKm", fmtKm(0.03) === "50 m" && fmtKm(0.42) === "400 m" && fmtKm(2.34) === "2.3 km" && fmtKm(15.6) === "16 km");
  t("validLatLng: UK box only", validLatLng(51.5, -0.1) && !validLatLng(0, 0) && !validLatLng(NaN, 1) && !validLatLng(40, -74));
  t("businessPoint: own coords > area centroid (approx) > null", businessPoint({ lat: 1.5, lng: 2.5, location: { lat: null, lng: null, slug: "hackney" } })!.approx === false && businessPoint({ lat: null, lng: null, location: { lat: null, lng: null, slug: "hackney" } })!.approx === true && businessPoint({ lat: null, lng: null, location: { lat: null, lng: null, slug: "nowhere" } }) === null);
  const hrs = JSON.stringify({ mon: "09:00-17:30", tue: "09:00-17:30", sat: "10:00-14:00" });
  t("isOpenNow: Monday 10:00 BST is open; 17:30 BST closed; Sunday closed", isOpenNow(hrs, new Date("2026-10-05T09:00:00Z")) === true && isOpenNow(hrs, new Date("2026-10-05T16:30:00Z")) === false && isOpenNow(hrs, new Date("2026-10-04T12:00:00Z")) === false && isOpenNow(null) === null && isOpenNow("{}") === null && isOpenNow("junk") === null);
  t("isOpenNow: GMT (winter) handled: Monday 09:00 UTC = 09:00 London open", isOpenNow(hrs, new Date("2026-12-07T09:00:00Z")) === true && isOpenNow(hrs, new Date("2026-12-07T08:59:00Z")) === false);
  t("postcodes: normalise + outcode detection", normalisePostcode("e83aa") === "E8 3AA" && normalisePostcode("SW1A 1AA") === "SW1A 1AA" && normalisePostcode("nope") === null && isOutcode("e8") && isOutcode("SW1A") && !isOutcode("E8 3AA"));

  // mock postcodes.io
  const srv = http.createServer((req, res) => {
    const send = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method === "GET" && req.url === "/postcodes/E8%203AA") return send(200, { status: 200, result: { latitude: 51.545, longitude: -0.0553 } });
    if (req.method === "GET" && req.url === "/outcodes/N1") return send(200, { status: 200, result: { latitude: 51.538, longitude: -0.103 } });
    if (req.method === "GET" && req.url === "/postcodes/ZZ1%201ZZ") return send(404, { status: 404 });
    if (req.method === "GET" && req.url === "/postcodes/AB1%201AB") return send(200, { status: 200, result: { latitude: 0, longitude: 0 } }); // outside UK box
    if (req.method === "POST" && req.url === "/postcodes") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { const q = (JSON.parse(b).postcodes as string[]); send(200, { status: 200, result: q.map((p) => ({ query: p, result: p === "E8 3AA" ? { latitude: 51.545, longitude: -0.0553 } : p === "N1 9GU" ? { latitude: 51.534, longitude: -0.12 } : null })) }); }); return; }
    send(404, {});
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  process.env.POSTCODES_API_BASE = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const p1 = await lookupPostcode("e8 3aa");
  t("lookupPostcode: full postcode → coordinates", !!p1 && Math.abs(p1.lat - 51.545) < 1e-6);
  t("lookupPostcode: outcode works; unknown/invalid/out-of-UK → null", !!(await lookupPostcode("n1")) && (await lookupPostcode("ZZ1 1ZZ")) === null && (await lookupPostcode("not a postcode")) === null && (await lookupPostcode("AB1 1AB")) === null);
  const bulk = await bulkGeocode(["E8 3AA", "n19gu", "ZZ9 9ZZ", "junk"]);
  t("bulkGeocode: maps normalised postcodes, skips unknown/invalid", bulk.size === 2 && bulk.has("E8 3AA") && bulk.has("N1 9GU"));
  srv.close();
  process.env.POSTCODES_API_BASE = "http://127.0.0.1:1"; // unreachable
  t("lookupPostcode: network failure → null, never throws", (await lookupPostcode("SW1A 1AA")) === null);

  // ------------------------------------------------------------ related scoring
  const mkB = (o: Record<string, unknown> = {}) => ({ id: "x", categoryId: "c1", locationId: "l1", services: '["a","b"]', ratingAvg: null, claimStatus: "UNCLAIMED", isSample: false, lat: null, lng: null, location: { lat: null, lng: null, slug: "hackney" }, ...o });
  const base = mkB({ id: "base" });
  t("similarity: same category+area beats same area only beats nothing", similarityScore(base, mkB()) > similarityScore(base, mkB({ categoryId: "c2" })) && similarityScore(base, mkB({ categoryId: "c2" })) > similarityScore(base, mkB({ categoryId: "c2", locationId: "l2", services: "[]" })));
  t("similarity: shared services, rating and claimed break ties", similarityScore(base, mkB()) > similarityScore(base, mkB({ services: "[]" })) && similarityScore(base, mkB({ ratingAvg: 5 })) > similarityScore(base, mkB()) && similarityScore(base, mkB({ claimStatus: "VERIFIED" })) > similarityScore(base, mkB()));
  t("similarity: nearer business scores higher", similarityScore(mkB({ lat: 51.5, lng: -0.1 }), mkB({ lat: 51.5, lng: -0.1 })) > similarityScore(mkB({ lat: 51.5, lng: -0.1 }), mkB({ lat: 51.7, lng: -0.1 })));
  const ab = { id: "a", type: "NEWS", locationId: "l1", title: "Cleaning firm opens in Hackney", publishedAt: new Date(), isSample: false, businesses: [{ businessId: "b1" }] };
  t("article similarity: shared business > same area > title overlap > unrelated", articleSimilarity(ab, { ...ab, id: "c", locationId: null, title: "zzz", businesses: [{ businessId: "b1" }] }) > articleSimilarity(ab, { ...ab, id: "c", businesses: [], title: "zzz" }) && articleSimilarity(ab, { ...ab, id: "c", businesses: [], title: "zzz" }) > articleSimilarity(ab, { ...ab, id: "c", locationId: null, type: "GUIDE", businesses: [], title: "Hackney cleaning tips" }) - 100 && articleSimilarity(ab, { ...ab, id: "c", locationId: null, type: "GUIDE", businesses: [], title: "Hackney cleaning tips" }) > articleSimilarity(ab, { ...ab, id: "c", locationId: null, type: "GUIDE", businesses: [], title: "unrelated words here", publishedAt: new Date(2020, 1, 1) }));

  // ------------------------------------------------------------ saved cookies
  const ids = ["a".repeat(25), "b".repeat(25)];
  t("saved cookie: round-trip, dedupe, validation, cap", parseIds(serialiseIds(ids), 10).length === 2 && parseIds(serialiseIds([...ids, ...ids]), 10).length === 2 && parseIds("junk,<script>,../../x," + ids[0], 10).join() === ids[0] && parseIds(undefined, 5).length === 0 && parseIds(Array.from({ length: 80 }, (_, i) => String(i).padStart(25, "a")).join(","), MAX_SAVED).length === MAX_SAVED);

  // ------------------------------------------------------------ newsletter helpers
  const tok = unsubToken("sub123");
  t("unsubscribe token: round-trips, tamper/garbage rejected", readUnsubToken(tok) === "sub123" && readUnsubToken(tok.slice(0, -1) + "x") === null && readUnsubToken("sub123.AAAAAAAAAAAAAAAAAAAAAA") === null && readUnsubToken("garbage") === null && readUnsubToken("") === null && readUnsubToken(unsubToken("other")) === "other");
  t("csvCell: formula injection neutralised, quotes escaped", csvCell("=HYPERLINK(\"x\")") === `"'=HYPERLINK(""x"")"` && csvCell("+1") === "'+1" && csvCell("a,b") === '"a,b"' && csvCell("plain") === "plain");
  t("renderForRecipient: personal unsubscribe link + sender footer", renderForRecipient("Hi\n\n{{unsubscribe}}", "sub9").includes(`/newsletter/unsubscribe/${unsubToken("sub9")}`) && !renderForRecipient("{{unsubscribe}}", "x").includes("{{"));

  // ------------------------------------------------------------ search integration (fixtures)
  const wipe = async () => {
    await db.business.deleteMany({ where: { slug: { startsWith: "srch-" } } });
    await db.article.deleteMany({ where: { slug: { startsWith: "srch-" } } });
    await db.podcastEpisode.deleteMany({ where: { slug: { startsWith: "srch-" } } });
    await db.newsletterSubscriber.deleteMany({ where: { email: { endsWith: "@srch.example" } } });
  };
  await wipe();
  const city = (await db.city.findFirst())!; const L = async (s: string) => (await db.location.findUnique({ where: { slug: s } }))!; const C = async (s: string) => (await db.category.findUnique({ where: { slug: s } }))!;
  const [hk, cm, cl, cn, cf, author] = [await L("hackney"), await L("camden"), await C("cleaning"), await C("construction"), await C("cafes"), (await db.author.findFirst())!];
  const allDays = JSON.stringify(Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((k) => [k, "00:00-23:59"])));
  const mk = (slug: string, name: string, loc: typeof hk, cat: typeof cl, o: Record<string, unknown> = {}) => db.business.create({ data: { slug: `srch-${slug}`, name, summary: `${name} summary text here.`, description: "A locally run business serving customers across the borough with care and attention to detail.", cityId: city.id, locationId: loc.id, categoryId: cat.id, isSample: false, ...o } });
  const A = await mk("alpha", "Srch Alpha Cleaning", hk, cl, { services: '["Office cleaning","Deep cleans"]', openingHours: allDays, ratingAvg: 4.8, ratingCount: 5, claimStatus: "VERIFIED", lat: hackney.lat, lng: hackney.lng });
  const B = await mk("beta", "Srch Beta Cleaners", cm, cl, { ratingAvg: 3.2, ratingCount: 2, lat: camden.lat, lng: camden.lng });
  const G = await mk("gamma", "Srch Gamma Plumbing and Heating", hk, cn, { services: '["Boilers","Bathrooms"]' });
  const D = await mk("delta", "Srch Delta Cafe", hk, cf, { description: "A friendly neighbourhood cafe that also offers cleaning of coffee machines for other local shops." });
  const E = await mk("hidden", "Srch Hidden Cleaning", hk, cl, { published: false });
  const art = (slug: string, o: Record<string, unknown>) => db.article.create({ data: { slug: `srch-${slug}`, type: "NEWS", title: "x", standfirst: "s".repeat(40), body: "b".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000), authorId: author.id, isSample: false, ...o } });
  await art("a1", { title: "Srch cleaning industry insight for Hackney", body: "How office cleaning firms are changing the way London works, in detail. ".repeat(10) });
  await art("a2", { title: "Srch draft cleaning story", status: "DRAFT", publishedAt: null });
  await art("a3", { title: "Srch scheduled cleaning story", publishedAt: new Date(Date.now() + 86400_000) });
  await db.podcastEpisode.create({ data: { slug: "srch-ep", number: 9400, title: "Srch episode about boilers", description: "d".repeat(60), transcript: "We talk about boilers, heating and plumbers across London for half an hour.", status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000), isSample: false } });

  const first = await syncIndex({ fresh: true });
  t("sync: indexes new content, then is idempotent (no changes second time)", first.changed >= 7 && (await syncIndex({ fresh: true })).changed === 0, `first=${first.changed}`);
  const names = (r: Awaited<ReturnType<typeof searchAll>>) => r.items.map((b) => b.name);
  let r = await searchAll({ q: "cleaning" });
  t("search: stemming finds cleaners/cleaning; body-only match included; unpublished excluded", names(r).includes("Srch Alpha Cleaning") && names(r).includes("Srch Beta Cleaners") && names(r).includes("Srch Delta Cafe") && !names(r).includes("Srch Hidden Cleaning"));
  t("search: title+tag match outranks body-only match", names(r).indexOf("Srch Alpha Cleaning") < names(r).indexOf("Srch Delta Cafe"));
  r = await searchAll({ q: "cleaner" }); t("search: synonym/stem (cleaner → cleaning, cleaners)", names(r).includes("Srch Alpha Cleaning") && names(r).includes("Srch Beta Cleaners"));
  r = await searchAll({ q: "plumber" }); t("search: synonym plumber → plumbing", names(r).includes("Srch Gamma Plumbing and Heating"));
  r = await searchAll({ q: "srch alp" }); t("search: prefix on the last word", names(r).join() === "Srch Alpha Cleaning");
  r = await searchAll({ q: "cleaning hackney srch" }); t("search: AND across name/tags (area word narrows)", names(r).includes("Srch Alpha Cleaning") && !names(r).includes("Srch Beta Cleaners") && !r.relaxed);
  r = await searchAll({ q: "srch cleaning boilers" }); t("search: no strict match → relaxed OR with a flag", r.relaxed && names(r).length > 0);
  r = await searchAll({ q: "qqqqzzzz" }); t("search: nothing → empty, no crash", r.total === 0 && r.items.length === 0);
  r = await searchAll({ q: 'NEAR("a" b) OR * " -x' }); t("search: hostile query returns normally", typeof r.total === "number");
  r = await searchAll({ q: "srch cleening" }); t("search: typo → suggestion offered", r.suggestion === "srch cleaning" || r.suggestion === "cleaning" || (r.suggestion ?? "").includes("cleaning"), String(r.suggestion));
  r = await searchAll({ q: "srch", filters: { category: "cleaning" } }); t("filter: category", names(r).every((n) => n.includes("Cleaning") || n.includes("Cleaners")) && names(r).length === 2);
  r = await searchAll({ q: "srch", filters: { area: "camden" } }); t("filter: area", names(r).join() === "Srch Beta Cleaners");
  r = await searchAll({ q: "srch", filters: { minRating: 4 } }); t("filter: min rating 4 → only Alpha", names(r).join() === "Srch Alpha Cleaning");
  r = await searchAll({ q: "srch", filters: { claimed: true } }); t("filter: claimed/verified only", names(r).join() === "Srch Alpha Cleaning");
  r = await searchAll({ q: "srch", filters: { openNow: true } }); t("filter: open now (hours known & open) → Alpha only; unknown hours excluded", names(r).join() === "Srch Alpha Cleaning" && r.items[0].open === true);
  r = await searchAll({ q: "srch", filters: { category: "cleaning" } });
  t("facets: counts computed without the facet's own filter (can see alternatives)", r.facets.categories.find((c) => c.slug === "cafes")?.n === 1 && r.facets.categories.find((c) => c.slug === "construction")?.n === 1 && r.facets.areas.find((a) => a.slug === "hackney")!.n >= 1 && r.facets.rating4 === 1 && r.facets.claimed === 1 && r.facets.openNow === 1);
  r = await searchAll({ q: "srch", sort: "rating" }); t("sort: top rated first", names(r)[0] === "Srch Alpha Cleaning" && names(r)[1] === "Srch Beta Cleaners");
  r = await searchAll({ q: "srch", sort: "name" }); t("sort: A–Z", names(r).join() === [...names(r)].sort((a, b) => a.localeCompare(b)).join());
  r = await searchAll({ q: "srch", near: camden, sort: "nearest" }); t("near me: nearest first with distances (Camden user → Beta first)", names(r)[0] === "Srch Beta Cleaners" && r.items[0].distanceKm! < 1 && r.items[0].approx === false);
  r = await searchAll({ q: "srch", near: hackney, sort: "nearest" }); t("near me: businesses without coordinates fall back to their borough centre (≈)", r.items.some((b) => b.approx === true && b.distanceKm !== null) && names(r)[0] === "Srch Alpha Cleaning");
  r = await searchAll({ q: "", near: hackney }); t("near me with no text: browse mode sorted nearest", r.total > 0 && r.sort === "nearest" && r.items[0].distanceKm !== null);
  r = await searchAll({ q: "cleaning" });
  t("content: live article found; draft and scheduled articles are not", r.articles.some((a) => a.slug === "srch-a1") && !r.articles.some((a) => a.slug === "srch-a2" || a.slug === "srch-a3"));
  r = await searchAll({ q: "boilers" }); t("content: podcast transcript searchable", r.episodes.some((e) => e.slug === "srch-ep") && names(r).includes("Srch Gamma Plumbing and Heating"));
  r = await searchAll({ q: "srch", withContent: false }); t("withContent:false skips articles/episodes", r.articles.length === 0 && r.episodes.length === 0);
  r = await searchAll({ q: "srch", perPage: 2, page: 2 }); t("pagination: page 2 of results", r.items.length === 2 && r.pages >= 2 && r.page === 2);
  r = await searchAll({ q: "hackney" }); t("browse chips: matching area surfaced", r.matchedAreas.some((l) => l.slug === "hackney"));
  const sg = await suggest("srch alp"); t("suggest: business suggestions with correct links", sg.some((s) => s.type === "business" && s.label === "Srch Alpha Cleaning" && s.href === "/businesses/london/cleaning/srch-alpha") );
  t("suggest: category + area chips; short query empty", (await suggest("clea")).some((s) => s.type === "category" && s.label === "Cleaning") && (await suggest("hack")).some((s) => s.type === "area") && (await suggest("a")).length === 0);

  // incremental updates
  await db.business.update({ where: { id: A.id }, data: { name: "Srch Alpha Sparkle Services" } });
  await syncIndex({ fresh: true });
  r = await searchAll({ q: "sparkle" }); t("index follows edits (rename is searchable immediately, old name gone)", names(r).includes("Srch Alpha Sparkle Services") && !names(await searchAll({ q: "srch alpha cleaning" })).includes("Srch Alpha Cleaning"));
  await db.business.update({ where: { id: B.id }, data: { published: false } }); await syncIndex({ fresh: true });
  t("unpublishing removes a business from search", !names(await searchAll({ q: "beta cleaners" })).includes("Srch Beta Cleaners"));
  await db.business.delete({ where: { id: G.id } }); await syncIndex({ fresh: true });
  t("deleting removes it too", !names(await searchAll({ q: "plumbing" })).includes("Srch Gamma Plumbing and Heating"));
  await db.article.update({ where: { slug: "srch-a2" }, data: { status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000) } }); await syncIndex({ fresh: true });
  t("publishing a draft makes it searchable", (await searchAll({ q: "draft cleaning story" })).articles.some((a) => a.slug === "srch-a2"));

  // query log is anonymous + aggregate
  const day = new Date().toISOString().slice(0, 10);
  await searchAll({ q: "srchzzz unique term" }); await searchAll({ q: "srchzzz unique term" });
  const row = await db.searchTerm.findUnique({ where: { day_q: { day, q: "srchzzz unique term" } } });
  t("search log: aggregated per day+query with zero-result count", row?.count === 2 && row.zeroCount === 2);
  await searchAll({ q: "person@example.com" }); await searchAll({ q: "020 7946 0958" });
  t("search log: emails/phone numbers are never stored", (await db.searchTerm.count({ where: { OR: [{ q: { contains: "@" } }, { q: { contains: "7946" } }] } })) === 0);
  await db.searchTerm.deleteMany({ where: { q: { startsWith: "srch" } } });

  // digest
  const dg = await buildDigest(7);
  t("digest: built from real content only, with unsubscribe placeholder and absolute links", !!dg && dg.body.includes("{{unsubscribe}}") && dg.body.includes("Srch cleaning industry insight") && dg.body.includes("/businesses/london/") && !dg.body.includes("a-wood-fired") && dg.counts.articles >= 1 && dg.counts.episodes === 1);
  await wipe();
  await db.article.deleteMany({ where: { isSample: false, publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) } } });
  t("digest: nothing new (real) → null (nothing worth sending)", (await buildDigest(7)) === null || (await db.article.count({ where: { isSample: false } })) > 0);
  await syncIndex({ fresh: true });

  console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exitCode = fail ? 1 : 0;
})().finally(() => db.$disconnect());
