import { db } from "../src/lib/db";
import { LOCCAT_RICH_COUNT, MIN_BUSINESSES, MIN_INTRO_CHARS, decideBusiness, decideCategory, decideLocCat, decideLocation, listingMetadata, resolveIntro } from "../src/lib/seo-engine";
import { checkRedirect, createRedirect, normalisePath, resolveRedirect } from "../src/lib/redirects";
import { urlsetXml, indexXml } from "../src/lib/sitemaps";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const intro = "x".repeat(MIN_INTRO_CHARS);
const shortIntro = "x".repeat(MIN_INTRO_CHARS - 1);

(async () => {
  // ---- gate: areas / categories
  t("area: enough businesses + intro → index", decideLocation(MIN_BUSINESSES, intro).index);
  t("area: 2 businesses → noindex, says how many more", (() => { const v = decideLocation(MIN_BUSINESSES - 1, intro); return !v.index && v.needs[0].includes("1 more real business"); })());
  t("area: intro one char short → noindex", !decideLocation(10, shortIntro).index && !decideLocation(10, null).index && !decideLocation(10, "   ").index);
  t("area: zero businesses → noindex even when forced INDEX", !decideLocation(0, intro, { robots: "INDEX" }).index);
  t("area: INDEX override unlocks thin-but-nonempty page", decideLocation(1, null, { robots: "INDEX" }).index);
  t("area: NOINDEX override beats a perfect page", !decideLocation(50, intro, { robots: "NOINDEX" }).index);
  t("category uses the same rule", decideCategory(5, intro).index && !decideCategory(5, null).index);
  // ---- gate: area × category
  t("area×cat: 3 businesses without intro → noindex", !decideLocCat(3, null).index);
  t("area×cat: 3 businesses WITH intro → index", decideLocCat(3, intro).index);
  t(`area×cat: ${LOCCAT_RICH_COUNT}+ businesses need no intro`, decideLocCat(LOCCAT_RICH_COUNT, null).index && !decideLocCat(LOCCAT_RICH_COUNT - 1, null).index);
  t("area×cat: fewer than 3 never indexed without override", !decideLocCat(2, intro).index);
  // ---- gate: business
  const biz = { isSample: false, published: true, description: "d".repeat(120), phone: null, website: null, openingHours: null, services: null, imageUrl: null, ratingCount: 0 };
  t("business: long real description → index", decideBusiness(biz).index);
  t("business: short description + nothing else → thin noindex", !decideBusiness({ ...biz, description: "short" }).index);
  t("business: short description but has a phone → index", decideBusiness({ ...biz, description: "short", phone: "020" }).index);
  t("business: short description but has a published review → index", decideBusiness({ ...biz, description: "short", ratingCount: 1 }).index);
  t("business: empty JSON hours/services don't count as details", !decideBusiness({ ...biz, description: "short", openingHours: "{}", services: "[]" }).index);
  t("business: sample / unpublished never indexed (even INDEX override)", !decideBusiness({ ...biz, isSample: true }, { robots: "INDEX" }).index && !decideBusiness({ ...biz, published: false }, { robots: "INDEX" }).index);
  t("business: INDEX override rescues a thin profile; NOINDEX hides a good one", decideBusiness({ ...biz, description: "short" }, { robots: "INDEX" }).index && !decideBusiness(biz, { robots: "NOINDEX" }).index);
  t("resolveIntro: override beats entity; blanks ignored", resolveIntro({ intro: "A" }, "B") === "A" && resolveIntro({ intro: "  " }, "B") === "B" && resolveIntro(null, "  ") === null);

  // ---- metadata builder
  const ok = { index: true, reasons: [], needs: [] }, no = { index: false, reasons: [], needs: [] };
  const m1 = listingMetadata({ path: "/locations/x", title: "T", description: "D", verdict: ok });
  const m2 = listingMetadata({ path: "/locations/x", title: "T", description: "D", verdict: ok, page: 2 });
  const m3 = listingMetadata({ path: "/locations/x", title: "T", description: "D", verdict: no });
  const m4 = listingMetadata({ path: "/locations/x", title: "T", description: "D", verdict: ok, override: { title: "Custom", description: "Custom desc" } });
  t("metadata: indexable page has no robots restriction and self canonical", m1.robots === undefined && String(m1.alternates?.canonical).endsWith("/locations/x"));
  t("metadata: page 2 is noindex,follow with ?page canonical", (m2.robots as { index: boolean }).index === false && String(m2.alternates?.canonical).endsWith("/locations/x?page=2"));
  t("metadata: failing gate → noindex,follow", (m3.robots as { index: boolean; follow: boolean }).index === false && (m3.robots as { follow: boolean }).follow === true);
  t("metadata: overrides replace title/description", m4.title === "Custom" && m4.description === "Custom desc");

  // ---- redirects
  t("normalisePath", normalisePath("/Foo//Bar/?x=1#y") === "/foo/bar" && normalisePath("foo") === "/foo" && normalisePath("/") === "/" && normalisePath("/a/") === "/a");
  t("normalisePath: other host rejected, own host accepted", normalisePath("https://evil.example/x") === "" && normalisePath(`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://primestreet.uk"}/Path`) === "/path");
  await db.redirect.deleteMany({ where: { fromPath: { startsWith: "/t-seo-" } } });
  t("redirect: self-redirect refused", !(await checkRedirect("/t-seo-a", "/t-seo-a/")).ok);
  const proto = await checkRedirect("/t-seo-a", "//evil.example/x");
  t("redirect: external target refused; protocol-relative collapsed to a harmless local path (no open redirect)", !(await checkRedirect("/t-seo-a", "https://evil.example/x")).ok && proto.ok && proto.to === "/evil.example/x" && !proto.to.startsWith("//"));
  t("redirect: reserved paths refused", !(await checkRedirect("/admin/x", "/y")).ok && !(await checkRedirect("/owner", "/y")).ok && !(await checkRedirect("/", "/y")).ok);
  t("redirect: valid accepted", (await createRedirect("/t-seo-a", "/t-seo-b")).ok);
  t("redirect: loop refused (b→a when a→b)", !(await checkRedirect("/t-seo-b", "/t-seo-a")).ok);
  await createRedirect("/t-seo-b", "/t-seo-c");
  t("redirect: chain collapsed (a now points straight at c)", (await db.redirect.findUnique({ where: { fromPath: "/t-seo-a" } }))?.toPath === "/t-seo-c");
  t("redirect: resolve follows chains; unknown → null; no self result", (await resolveRedirect("/t-seo-a")) === "/t-seo-c" && (await resolveRedirect("/t-seo-zzz")) === null && (await resolveRedirect("/t-seo-c")) === null);
  t("redirect: 3-hop loop refused", !(await checkRedirect("/t-seo-c", "/t-seo-a")).ok);
  await createRedirect("/t-seo-a", "/t-seo-d");
  t("redirect: updating an existing one overwrites (no duplicate row)", (await db.redirect.count({ where: { fromPath: "/t-seo-a" } })) === 1 && (await resolveRedirect("/t-seo-a")) === "/t-seo-d");
  await db.redirect.deleteMany({ where: { fromPath: { startsWith: "/t-seo-" } } });

  // ---- sitemap xml
  const x = urlsetXml([{ path: "/a&b" }, { path: "/c", lastmod: new Date("2026-01-02T03:04:05Z") }]);
  t("sitemap: XML-escaped, lastmod date-only, well formed", x.includes("/a&amp;b") && x.includes("<lastmod>2026-01-02</lastmod>") && x.startsWith("<?xml") && x.trim().endsWith("</urlset>"));
  t("sitemap index: lists child files", indexXml([{ name: "pages-1.xml" }]).includes("/sitemaps/pages-1.xml") && indexXml([]).includes("<sitemapindex"));

  console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exitCode = fail ? 1 : 0;
})().finally(() => db.$disconnect());
