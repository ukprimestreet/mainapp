import type { Metadata } from "next";
import { ARTICLE_TYPES } from "./constants";
import { db } from "./db";
import { abs } from "./seo";

/**
 * THE quality gate. Pages, sitemaps and the admin "index health" screen all call these functions, so what we tell
 * search engines (meta robots) can never drift from what we list in the sitemap.
 */
export const MIN_BUSINESSES = 3; // real (non-sample) published businesses an area/category page needs before it may be indexed
export const MIN_INTRO_CHARS = 100; // original editorial intro needed for area / category pages
export const LOCCAT_RICH_COUNT = 5; // an area×category page with this many businesses is valuable even without a custom intro
export const PAGE_SIZE = 24;

export type Verdict = { index: boolean; reasons: string[]; needs: string[] };
type Override = { robots: string; intro?: string | null } | null | undefined;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const introLength = (s?: string | null) => (s ?? "").trim().length;
export const resolveIntro = (override: { intro?: string | null } | null | undefined, entityIntro?: string | null) => {
  const v = override?.intro?.trim() || entityIntro?.trim() || "";
  return v || null;
};

function finish(v: Verdict, count: number, override: Override): Verdict {
  if (override?.robots === "NOINDEX") return { index: false, reasons: ["Manually set to noindex"], needs: [] };
  if (count === 0) return { index: false, reasons: ["No real businesses yet"], needs: ["Add real businesses"] };
  if (override?.robots === "INDEX") return { index: true, reasons: ["Manually forced to index (quality checks overridden)"], needs: [] };
  return v;
}

export function decideLocation(count: number, intro: string | null, override?: Override): Verdict {
  const needs: string[] = [], reasons: string[] = [];
  if (count < MIN_BUSINESSES) { needs.push(`${plural(MIN_BUSINESSES - count, "more real business")}`); reasons.push(`Only ${count} real business${count === 1 ? "" : "es"} (need ${MIN_BUSINESSES})`); }
  if (introLength(intro) < MIN_INTRO_CHARS) { needs.push(`Original intro of ${MIN_INTRO_CHARS}+ characters`); reasons.push("No original intro"); }
  return finish({ index: !needs.length, reasons: needs.length ? reasons : ["Passes quality gate"], needs }, count, override);
}
export const decideCategory = decideLocation; // same rule: enough real businesses + original intro

export function decideLocCat(count: number, intro: string | null, override?: Override): Verdict {
  const needs: string[] = [], reasons: string[] = [];
  if (count < MIN_BUSINESSES) { needs.push(`${plural(MIN_BUSINESSES - count, "more real business")}`); reasons.push(`Only ${count} real business${count === 1 ? "" : "es"} (need ${MIN_BUSINESSES})`); }
  else if (introLength(intro) < MIN_INTRO_CHARS && count < LOCCAT_RICH_COUNT) { needs.push(`Original intro of ${MIN_INTRO_CHARS}+ characters, or ${plural(LOCCAT_RICH_COUNT - count, "more business")}`); reasons.push("Thin: few businesses and no original intro"); }
  return finish({ index: !needs.length, reasons: needs.length ? reasons : ["Passes quality gate"], needs }, count, override);
}

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
export type IndexableSet = { pages: SitemapEntry[]; articles: SitemapEntry[]; businesses: SitemapEntry[]; locations: SitemapEntry[]; categories: SitemapEntry[]; podcast: SitemapEntry[]; authors: SitemapEntry[] };

export async function collectIndexable(): Promise<IndexableSet> {
  const now = new Date();
  const [overrides, counts, locations, categories, businesses, articles, eps, authors] = await Promise.all([
    db.seoPage.findMany(),
    realCounts(),
    db.location.findMany({ include: { city: true } }),
    db.category.findMany(),
    db.business.findMany({ where: { published: true, isSample: false }, include: { city: true, category: true, location: true } }),
    db.article.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { lte: now } } }),
    db.podcastEpisode.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { lte: now } } }),
    db.author.findMany({ where: { articles: { some: { status: "PUBLISHED", isSample: false, publishedAt: { lte: now } } } } }),
  ]);
  const ov = new Map(overrides.map((o) => [o.path, o]));
  const city = locations[0]?.city.slug ?? "london";
  const pages: SitemapEntry[] = [
    { path: "/", priority: 1 }, { path: "/businesses", priority: 0.9 }, { path: "/locations", priority: 0.7 }, { path: "/podcast", priority: 0.7 },
    { path: "/about", priority: 0.5 }, { path: "/privacy", priority: 0.2 }, { path: "/advertise", priority: 0.4 }, { path: "/claim", priority: 0.7 }, { path: "/businesses/submit", priority: 0.5 },
    ...Object.values(ARTICLE_TYPES).map((t) => ({ path: `/${t.path}`, priority: 0.8 })),
  ];
  const cityReal = [...counts.byLocation.values()].reduce((a, b) => a + b, 0);
  const cityPath = `/businesses/${city}`;
  if (ov.get(cityPath)?.robots !== "NOINDEX" && (ov.get(cityPath)?.robots === "INDEX" ? cityReal > 0 : cityReal >= MIN_BUSINESSES)) pages.push({ path: cityPath, priority: 0.9 });
  const locEntries: SitemapEntry[] = [], catEntries: SitemapEntry[] = [];
  for (const l of locations) {
    const p = `/locations/${l.slug}`;
    if (decideLocation(counts.byLocation.get(l.id) ?? 0, resolveIntro(ov.get(p), l.intro), ov.get(p)).index) locEntries.push({ path: p, priority: 0.7 });
    for (const c of categories) {
      const lp = `/locations/${l.slug}/${c.slug}`;
      const n = counts.byLocCat.get(`${l.id}:${c.id}`) ?? 0;
      if (n && decideLocCat(n, resolveIntro(ov.get(lp), null), ov.get(lp)).index) locEntries.push({ path: lp, priority: 0.6 });
    }
  }
  for (const c of categories) {
    const p = `/businesses/${city}/${c.slug}`;
    if (decideCategory(counts.byCategory.get(c.id) ?? 0, resolveIntro(ov.get(p), c.intro), ov.get(p)).index) catEntries.push({ path: p, priority: 0.8 });
  }
  const bizEntries: SitemapEntry[] = businesses
    .filter((b) => decideBusiness(b, ov.get(`/businesses/${b.city.slug}/${b.category.slug}/${b.slug}`)).index)
    .map((b) => ({ path: `/businesses/${b.city.slug}/${b.category.slug}/${b.slug}`, lastmod: b.updatedAt, priority: 0.7 }));
  const artEntries: SitemapEntry[] = articles.map((a) => ({ path: `/${ARTICLE_TYPES[a.type as keyof typeof ARTICLE_TYPES].path}/${a.slug}`, lastmod: a.updatedAt, priority: 0.7 }));
  return {
    pages, articles: artEntries, businesses: bizEntries, locations: locEntries, categories: catEntries,
    podcast: eps.filter((e) => decideEpisode(e, ov.get(`/podcast/${e.slug}`)).index).map((e) => ({ path: `/podcast/${e.slug}`, lastmod: e.updatedAt, priority: 0.5 })),
    authors: authors.map((a) => ({ path: `/authors/${a.slug}`, priority: 0.4 })),
  };
}

// ---------- admin "index health" ----------
export type HealthRow = { path: string; kind: "Area" | "Category" | "Area × category"; label: string; count: number; introChars: number; verdict: Verdict; robots: string };
export async function seoHealth(): Promise<HealthRow[]> {
  const [overrides, counts, locations, categories] = await Promise.all([db.seoPage.findMany(), realCounts(), db.location.findMany({ include: { city: true } }), db.category.findMany()]);
  const ov = new Map(overrides.map((o) => [o.path, o]));
  const city = locations[0]?.city.slug ?? "london";
  const rows: HealthRow[] = [];
  for (const l of locations) {
    const p = `/locations/${l.slug}`, n = counts.byLocation.get(l.id) ?? 0, intro = resolveIntro(ov.get(p), l.intro);
    rows.push({ path: p, kind: "Area", label: l.name, count: n, introChars: introLength(intro), verdict: decideLocation(n, intro, ov.get(p)), robots: ov.get(p)?.robots ?? "AUTO" });
    for (const c of categories) {
      const lp = `/locations/${l.slug}/${c.slug}`, k = counts.byLocCat.get(`${l.id}:${c.id}`) ?? 0;
      if (!k) continue;
      const li = resolveIntro(ov.get(lp), null);
      rows.push({ path: lp, kind: "Area × category", label: `${c.name} in ${l.name}`, count: k, introChars: introLength(li), verdict: decideLocCat(k, li, ov.get(lp)), robots: ov.get(lp)?.robots ?? "AUTO" });
    }
  }
  for (const c of categories) {
    const p = `/businesses/${city}/${c.slug}`, n = counts.byCategory.get(c.id) ?? 0, intro = resolveIntro(ov.get(p), c.intro);
    rows.push({ path: p, kind: "Category", label: c.name, count: n, introChars: introLength(intro), verdict: decideCategory(n, intro, ov.get(p)), robots: ov.get(p)?.robots ?? "AUTO" });
  }
  return rows;
}
