import type { Metadata } from "next";
import { ARTICLE_TYPES } from "./constants";
import { db } from "./db";
import { abs } from "./seo";

/**
 * THE quality gate. Pages, sitemaps and the admin "index health" screen all call these functions, so what we tell
 * search engines (meta robots) can never drift from what we list in the sitemap.
 *
 * **Decision D7 (1 November 2026) changed what the gate tests.** It used to require real businesses on the
 * page: three, and zero was refused even with a manual override. The owner's instruction is that supply is
 * not the test — a job that arrives in an area we do not cover is a job they source a provider for — so a
 * page must no longer wait on listings to be findable.
 *
 * What replaces it is **substance**. A page is indexed when somebody landing on it gets something worth
 * having: either original editorial copy about that trade or area, or enough real businesses that the
 * listing itself is the substance. Either is enough; neither being present is not.
 *
 * That is the one protection worth keeping. Supply is no longer a gate, but "a page with nothing on it" has
 * to stay one, because thousands of near-identical empty pages is what gets a whole directory demoted — and
 * it is what the brief forbids.
 */
/** Real businesses that make a listing substantial on its own, with no editorial copy needed. */
export const SUBSTANTIAL_LISTING = 3;
export const MIN_INTRO_CHARS = 100; // original editorial intro needed for area / category pages
export const PAGE_SIZE = 24;

/**
 * @deprecated D7: supply is no longer a condition of being indexed. Kept as the "substantial listing"
 * threshold so existing callers keep compiling and reading sensibly; prefer `SUBSTANTIAL_LISTING`.
 */
export const MIN_BUSINESSES = SUBSTANTIAL_LISTING;
/** @deprecated D7: an area×category page no longer needs a business count at all. */
export const LOCCAT_RICH_COUNT = SUBSTANTIAL_LISTING;

export type Verdict = { index: boolean; reasons: string[]; needs: string[] };
type Override = { robots: string; intro?: string | null } | null | undefined;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const introLength = (s?: string | null) => (s ?? "").trim().length;
export const resolveIntro = (override: { intro?: string | null } | null | undefined, entityIntro?: string | null) => {
  const v = override?.intro?.trim() || entityIntro?.trim() || "";
  return v || null;
};

function finish(v: Verdict, _count: number, override: Override): Verdict {
  if (override?.robots === "NOINDEX") return { index: false, reasons: ["Manually set to noindex"], needs: [] };
  // No "count === 0" refusal any more: D7. An empty area with real copy about that area is a page worth
  // landing on; an empty area with nothing on it is refused below, for being empty rather than for being
  // unsupplied.
  if (override?.robots === "INDEX") return { index: true, reasons: ["Manually forced to index (quality checks overridden)"], needs: [] };
  return v;
}

/**
 * Substance, either way round: original copy, or a listing big enough to be the content itself.
 */
function decideBySubstance(count: number, intro: string | null, override: Override, what: string): Verdict {
  const hasIntro = introLength(intro) >= MIN_INTRO_CHARS;
  const hasListing = count >= SUBSTANTIAL_LISTING;
  if (hasIntro || hasListing) {
    return finish({
      index: true,
      reasons: [hasIntro ? "Has an original intro" : `${plural(count, "real business")} listed`],
      needs: [],
    }, count, override);
  }
  return finish({
    index: false,
    reasons: [`Nothing on the page yet: no original intro, and ${count === 0 ? "no businesses" : plural(count, "business")}`],
    needs: [`Original intro of ${MIN_INTRO_CHARS}+ characters about ${what}, or ${plural(SUBSTANTIAL_LISTING - count, "more real business")}`],
  }, count, override);
}

export const decideLocation = (count: number, intro: string | null, override?: Override): Verdict =>
  decideBySubstance(count, intro, override, "this area");
export const decideCategory = (count: number, intro: string | null, override?: Override): Verdict =>
  decideBySubstance(count, intro, override, "this kind of work");

/** A city hub needs real businesses and an original intro, and a city we have not launched is never indexed. */
export function decideCity(count: number, intro: string | null, status: string, override?: Override): Verdict {
  if (status !== "LIVE") return { index: false, reasons: ["City has not launched yet"], needs: ["Launch the city"] };
  return decideLocation(count, intro, override);
}

/**
 * Area × trade. The same substance test, and the one place where the volume risk is real: seven boroughs by
 * seven hundred localities by eighteen trades is tens of thousands of URLs, so one of the two has to be
 * true about each of them before it goes in the index.
 */
export const decideLocCat = (count: number, intro: string | null, override?: Override): Verdict =>
  decideBySubstance(count, intro, override, "this trade in this area");

type BizLike = { isSample: boolean; published: boolean; description: string; phone: string | null; website: string | null; openingHours: string | null; services: string | null; imageUrl: string | null; ratingCount: number };
/** A profile is "thin" when it has barely more than a name: short description and no phone/website/hours/services/photo/reviews. */
export function decideBusiness(b: BizLike, override?: Override): Verdict {
  if (override?.robots === "NOINDEX") return { index: false, reasons: ["Manually set to noindex"], needs: [] };
  if (b.isSample) return { index: false, reasons: ["Sample (fictional) data"], needs: [] };
  if (!b.published) return { index: false, reasons: ["Unpublished"], needs: [] };
  const extras = [b.phone, b.website, b.openingHours && b.openingHours !== "{}", b.services && b.services !== "[]", b.imageUrl, b.ratingCount > 0].filter(Boolean).length;
  const thin = b.description.trim().length < 100 && extras === 0;
  if (thin && override?.robots !== "INDEX") return { index: false, reasons: ["Thin profile: short description and no contact details, hours, services, photo or reviews"], needs: ["Add details"] };
  return { index: true, reasons: ["Passes quality gate"], needs: [] };
}

type EpLike = { isSample: boolean; status: string; publishedAt: Date | null; transcript: string | null; showNotes: string | null };
/** An episode page is only worth indexing if it carries text: a transcript or substantial show notes (audio alone is invisible to search). */
export function decideEpisode(e: EpLike, override?: Override): Verdict {
  if (override?.robots === "NOINDEX") return { index: false, reasons: ["Manually set to noindex"], needs: [] };
  if (e.isSample) return { index: false, reasons: ["Sample (fictional) data"], needs: [] };
  if (e.status !== "PUBLISHED" || !e.publishedAt || e.publishedAt.getTime() > Date.now()) return { index: false, reasons: ["Not published yet"], needs: [] };
  const text = Math.max((e.transcript ?? "").trim().length, (e.showNotes ?? "").trim().length);
  if (text < 200 && override?.robots !== "INDEX") return { index: false, reasons: ["Thin episode page: no transcript or show notes"], needs: ["Add a transcript or show notes (200+ characters)"] };
  return { index: true, reasons: ["Passes quality gate"], needs: [] };
}

export async function getSeoPage(path: string) { return db.seoPage.findUnique({ where: { path } }); }

export async function realCounts() {
  const rows = await db.business.groupBy({ by: ["locationId", "categoryId"], where: { published: true, isSample: false }, _count: { _all: true } });
  const byLocation = new Map<string, number>(), byCategory = new Map<string, number>(), byLocCat = new Map<string, number>();
  for (const r of rows) {
    const n = r._count._all;
    byLocation.set(r.locationId, (byLocation.get(r.locationId) ?? 0) + n);
    byCategory.set(r.categoryId, (byCategory.get(r.categoryId) ?? 0) + n);
    byLocCat.set(`${r.locationId}:${r.categoryId}`, n);
  }
  return { byLocation, byCategory, byLocCat };
}

/** Build page metadata from the gate verdict + any manual override. Pagination > 1 is always noindex,follow with a self canonical. */
export function listingMetadata(o: { path: string; title: string; description: string; verdict: Verdict; override?: { title?: string | null; description?: string | null } | null; page?: number }): Metadata {
  const title = o.override?.title?.trim() || o.title;
  const description = o.override?.description?.trim() || o.description;
  const page = o.page ?? 1;
  const path = page > 1 ? `${o.path}?page=${page}` : o.path;
  const index = o.verdict.index && page === 1;
  return {
    title, description,
    alternates: { canonical: abs(path) },
    robots: index ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: abs(path), siteName: "PrimeStreet", type: "website", locale: "en_GB", images: [abs("/opengraph-image")] },
    twitter: { card: "summary_large_image", title, description },
  };
}

// ---------- everything indexable (single source for sitemaps + audit) ----------
export type SitemapEntry = { path: string; lastmod?: Date; priority?: number };
export type IndexableSet = { pages: SitemapEntry[]; articles: SitemapEntry[]; businesses: SitemapEntry[]; cities: SitemapEntry[]; locations: SitemapEntry[]; categories: SitemapEntry[]; podcast: SitemapEntry[]; authors: SitemapEntry[] };

export async function collectIndexable(): Promise<IndexableSet> {
  const now = new Date();
  const [overrides, counts, cities, locations, categories, businesses, articles, eps, authors] = await Promise.all([
    db.seoPage.findMany(),
    realCounts(),
    db.city.findMany({ where: { active: true } }),
    db.location.findMany({ include: { city: true } }),
    db.category.findMany(),
    db.business.findMany({ where: { published: true, isSample: false }, include: { city: true, category: true, location: true } }),
    db.article.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { lte: now } } }),
    db.podcastEpisode.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { lte: now } } }),
    db.author.findMany({ where: { articles: { some: { status: "PUBLISHED", isSample: false, publishedAt: { lte: now } } } } }),
  ]);
  const ov = new Map(overrides.map((o) => [o.path, o]));
  const pages: SitemapEntry[] = [
    { path: "/", priority: 1 }, { path: "/businesses", priority: 0.9 }, { path: "/podcast", priority: 0.7 },
    { path: "/about", priority: 0.5 }, { path: "/privacy", priority: 0.2 }, { path: "/advertise", priority: 0.4 }, { path: "/claim", priority: 0.7 }, { path: "/businesses/submit", priority: 0.5 },
    // The two sides of the lead system. Both are real pages people act on, so both belong in the sitemap;
    // their confirmation pages carry noindex and are deliberately absent.
    { path: "/get-quotes", priority: 0.9 }, { path: "/register", priority: 0.7 },
    ...Object.values(ARTICLE_TYPES).map((t) => ({ path: `/${t.path}`, priority: 0.8 })),
  ];
  // /locations is a city chooser: with a single city it redirects to that city's hub, so it is not a page of its own.
  if (cities.length > 1) pages.push({ path: "/locations", priority: 0.7 });
  const cityEntries: SitemapEntry[] = [], locEntries: SitemapEntry[] = [], catEntries: SitemapEntry[] = [];
  for (const city of cities.filter((c) => c.status === "LIVE")) {
    const inCity = locations.filter((l) => l.cityId === city.id);
    const cityReal = inCity.reduce((a, l) => a + (counts.byLocation.get(l.id) ?? 0), 0);
    for (const p of [`/businesses/${city.slug}`, `/locations/${city.slug}`]) {
      if (decideCity(cityReal, resolveIntro(ov.get(p), city.intro), city.status, ov.get(p)).index) cityEntries.push({ path: p, priority: 0.9 });
    }
    for (const l of inCity) {
      const p = `/locations/${city.slug}/${l.slug}`;
      if (decideLocation(counts.byLocation.get(l.id) ?? 0, resolveIntro(ov.get(p), l.intro), ov.get(p)).index) locEntries.push({ path: p, priority: 0.7 });
      for (const c of categories) {
        const lp = `/locations/${city.slug}/${l.slug}/${c.slug}`;
        const n = counts.byLocCat.get(`${l.id}:${c.id}`) ?? 0;
        // The `n &&` guard that used to be here excluded an area × trade page for having no businesses,
        // before the gate was even consulted — D7 removes that. The gate still refuses one with nothing on
        // it, which is what keeps this loop from emitting tens of thousands of URLs.
        if (decideLocCat(n, resolveIntro(ov.get(lp), null), ov.get(lp)).index) locEntries.push({ path: lp, priority: 0.6 });
      }
    }
    for (const c of categories) {
      const p = `/businesses/${city.slug}/${c.slug}`;
      const n = inCity.reduce((a, l) => a + (counts.byLocCat.get(`${l.id}:${c.id}`) ?? 0), 0);
      if (decideCategory(n, resolveIntro(ov.get(p), c.intro), ov.get(p)).index) catEntries.push({ path: p, priority: 0.8 });
    }
  }
  const bizEntries: SitemapEntry[] = businesses
    .filter((b) => b.city.active && b.city.status === "LIVE" && decideBusiness(b, ov.get(`/businesses/${b.city.slug}/${b.category.slug}/${b.slug}`)).index)
    .map((b) => ({ path: `/businesses/${b.city.slug}/${b.category.slug}/${b.slug}`, lastmod: b.updatedAt, priority: 0.7 }));
  const artEntries: SitemapEntry[] = articles.map((a) => ({ path: `/${ARTICLE_TYPES[a.type as keyof typeof ARTICLE_TYPES].path}/${a.slug}`, lastmod: a.updatedAt, priority: 0.7 }));
  return {
    pages, articles: artEntries, businesses: bizEntries, cities: cityEntries, locations: locEntries, categories: catEntries,
    podcast: eps.filter((e) => decideEpisode(e, ov.get(`/podcast/${e.slug}`)).index).map((e) => ({ path: `/podcast/${e.slug}`, lastmod: e.updatedAt, priority: 0.5 })),
    authors: authors.map((a) => ({ path: `/authors/${a.slug}`, priority: 0.4 })),
  };
}

// ---------- admin "index health" ----------
export type HealthRow = { path: string; kind: "City" | "Area" | "Category" | "Area × category"; label: string; count: number; introChars: number; verdict: Verdict; robots: string };
export async function seoHealth(): Promise<HealthRow[]> {
  const [overrides, counts, cities, locations, categories] = await Promise.all([
    db.seoPage.findMany(), realCounts(), db.city.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.location.findMany({ orderBy: { name: "asc" } }), db.category.findMany(),
  ]);
  const ov = new Map(overrides.map((o) => [o.path, o]));
  const rows: HealthRow[] = [];
  for (const city of cities) {
    const inCity = locations.filter((l) => l.cityId === city.id);
    const cityReal = inCity.reduce((a, l) => a + (counts.byLocation.get(l.id) ?? 0), 0);
    for (const p of [`/businesses/${city.slug}`, `/locations/${city.slug}`]) {
      const intro = resolveIntro(ov.get(p), city.intro);
      rows.push({ path: p, kind: "City", label: city.name, count: cityReal, introChars: introLength(intro), verdict: decideCity(cityReal, intro, city.status, ov.get(p)), robots: ov.get(p)?.robots ?? "AUTO" });
    }
    for (const l of inCity) {
      const p = `/locations/${city.slug}/${l.slug}`, n = counts.byLocation.get(l.id) ?? 0, intro = resolveIntro(ov.get(p), l.intro);
      rows.push({ path: p, kind: "Area", label: `${l.name}${l.kind === "NEIGHBOURHOOD" ? " (neighbourhood)" : ""}`, count: n, introChars: introLength(intro), verdict: decideLocation(n, intro, ov.get(p)), robots: ov.get(p)?.robots ?? "AUTO" });
      for (const c of categories) {
        const lp = `/locations/${city.slug}/${l.slug}/${c.slug}`, k = counts.byLocCat.get(`${l.id}:${c.id}`) ?? 0;
        // Area x trade is the one combination big enough to flood this screen (areas x trades), so it is
        // listed only where there is something to manage: real listings, or an override somebody has
        // already written. Without the second half an administrator could unlock one of these pages with
        // copy and then never see it here again.
        if (!k && !ov.get(lp)) continue;
        const li = resolveIntro(ov.get(lp), null);
        rows.push({ path: lp, kind: "Area × category", label: `${c.name} in ${l.name}`, count: k, introChars: introLength(li), verdict: decideLocCat(k, li, ov.get(lp)), robots: ov.get(lp)?.robots ?? "AUTO" });
      }
    }
    for (const c of categories) {
      const p = `/businesses/${city.slug}/${c.slug}`, n = inCity.reduce((a, l) => a + (counts.byLocCat.get(`${l.id}:${c.id}`) ?? 0), 0), intro = resolveIntro(ov.get(p), c.intro);
      rows.push({ path: p, kind: "Category", label: `${c.name} in ${city.name}`, count: n, introChars: introLength(intro), verdict: decideCategory(n, intro, ov.get(p)), robots: ov.get(p)?.robots ?? "AUTO" });
    }
  }
  return rows;
}
