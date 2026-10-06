import { ARTICLE_TYPES, type ArticleType } from "../constants";
import { db } from "../db";
import { AREA_CENTROIDS, businessPoint, haversineKm, isOpenNow, type LatLng } from "../geo";
import { businessInclude, parseJson } from "../queries";
import { ensureFts, ftsClear, ftsCount, ftsDelete, ftsQuery, ftsTexts, ftsUpsert } from "./fts";
import { buildMatch, contentTokens, loggableQuery, spellSuggest, stripMarkdown, tokenize } from "./text";

// ===================================================================== indexing
type Doc = { title: string; tags: string; body: string };
const join = (...p: (string | null | undefined | false)[]) => p.filter(Boolean).join(" ");

function businessDoc(b: { name: string; summary: string; description: string; areasServed: string | null; services: string | null; postcode: string | null; category: { name: string }; location: { name: string } }): Doc {
  return { title: b.name, tags: join(b.category.name, b.location.name, b.areasServed, parseJson<string[]>(b.services, []).join(" "), b.postcode), body: join(b.summary, b.description) };
}

let lastSync = 0, running: Promise<void> | null = null, vocab: Map<string, number> | null = null;
export const INDEX_STATS = { lastSync: 0, lastChanged: 0 };

async function reindexBatch(kind: "BUSINESS" | "ARTICLE" | "EPISODE", ids: string[], existing: Map<string, { rid: number }>): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    if (kind === "BUSINESS") {
      for (const b of await db.business.findMany({ where: { id: { in: chunk } }, include: { category: true, location: true } })) {
        n += await put("BUSINESS", b.id, b.updatedAt, b.createdAt, b.isSample, businessDoc(b), existing);
      }
    } else if (kind === "ARTICLE") {
      for (const a of await db.article.findMany({ where: { id: { in: chunk } }, include: { location: true, businesses: { include: { business: { select: { name: true } } } } } })) {
        const t = ARTICLE_TYPES[a.type as ArticleType]?.label ?? "";
        n += await put("ARTICLE", a.id, a.updatedAt, a.publishedAt ?? a.updatedAt, a.isSample, { title: a.title, tags: join(t, a.location?.name, a.businesses.map((x) => x.business.name).join(" ")), body: join(a.standfirst, stripMarkdown(a.body)) }, existing);
      }
    } else {
      for (const e of await db.podcastEpisode.findMany({ where: { id: { in: chunk } }, include: { business: { select: { name: true } } } })) {
        n += await put("EPISODE", e.id, e.updatedAt, e.publishedAt ?? e.updatedAt, e.isSample, { title: e.title, tags: join("podcast episode", e.guestName, e.business?.name), body: join(e.description, e.showNotes && stripMarkdown(e.showNotes), e.transcript?.slice(0, 30000)) }, existing);
      }
    }
  }
  return n;
}
async function put(kind: string, refId: string, updatedAt: Date, liveFrom: Date, isSample: boolean, doc: Doc, existing: Map<string, { rid: number }>) {
  const row = await db.searchDoc.upsert({ where: { kind_refId: { kind, refId } }, create: { kind, refId, visible: true, liveFrom, isSample, sourceUpdatedAt: updatedAt }, update: { visible: true, liveFrom, isSample, sourceUpdatedAt: updatedAt, indexedAt: new Date() } });
  await ftsUpsert(row.rid, doc.title, doc.tags, doc.body);
  existing.set(`${kind}:${refId}`, { rid: row.rid });
  return 1;
}

/**
 * Brings the index in line with the database. Cheap when nothing changed (one id+updatedAt scan per kind), so it runs
 * (throttled) at the start of searches; admins can force a full rebuild. Unpublished/draft items are removed.
 */
export async function syncIndex(opts: { force?: boolean; fresh?: boolean } = {}): Promise<{ changed: number }> {
  if (!opts.force && !opts.fresh && Date.now() - lastSync < 3000) return { changed: 0 };
  if (running) { await running; return { changed: 0 }; }
  let changed = 0;
  running = (async () => {
    await ensureFts();
    if (opts.force) { await ftsClear(); await db.searchDoc.deleteMany(); }
    const docs = await db.searchDoc.findMany();
    if ((await ftsCount()) < docs.length) { await ftsClear(); await db.searchDoc.deleteMany(); docs.length = 0; } // index drifted (e.g. FTS table dropped): rebuild
    const existing = new Map(docs.map((d) => [`${d.kind}:${d.refId}`, d]));
    const seen = new Set<string>();
    const stale = (kind: string, id: string, updatedAt: Date, liveFrom: Date) => {
      seen.add(`${kind}:${id}`);
      const d = existing.get(`${kind}:${id}`) as (typeof docs)[number] | undefined;
      return !d || d.sourceUpdatedAt.getTime() !== updatedAt.getTime() || d.liveFrom.getTime() !== liveFrom.getTime();
    };
    const [bs, as, es] = await Promise.all([
      db.business.findMany({ where: { published: true }, select: { id: true, updatedAt: true, createdAt: true } }),
      db.article.findMany({ where: { status: "PUBLISHED" }, select: { id: true, updatedAt: true, publishedAt: true } }),
      db.podcastEpisode.findMany({ where: { status: "PUBLISHED" }, select: { id: true, updatedAt: true, publishedAt: true } }),
    ]);
    const bi = bs.filter((b) => stale("BUSINESS", b.id, b.updatedAt, b.createdAt)).map((b) => b.id);
    const ai = as.filter((a) => stale("ARTICLE", a.id, a.updatedAt, a.publishedAt ?? a.updatedAt)).map((a) => a.id);
    const ei = es.filter((e) => stale("EPISODE", e.id, e.updatedAt, e.publishedAt ?? e.updatedAt)).map((e) => e.id);
    changed += await reindexBatch("BUSINESS", bi, existing as never) + await reindexBatch("ARTICLE", ai, existing as never) + await reindexBatch("EPISODE", ei, existing as never);
    // articles/episodes: liveFrom stored as publishedAt (fall back to updatedAt) — recheck via put() on change only
    for (const d of docs) if (!seen.has(`${d.kind}:${d.refId}`)) { await ftsDelete(d.rid); await db.searchDoc.delete({ where: { rid: d.rid } }).catch(() => {}); changed++; }
    if (changed) vocab = null;
    INDEX_STATS.lastSync = Date.now(); if (changed) INDEX_STATS.lastChanged = Date.now();
  })().finally(() => { lastSync = Date.now(); running = null; });
  await running;
  return { changed };
}

async function getVocab(): Promise<Map<string, number>> {
  if (vocab) return vocab;
  const m = new Map<string, number>();
  for (const r of await ftsTexts()) for (const w of tokenize(`${r.title} ${r.tags}`)) if (w.length >= 3) m.set(w, (m.get(w) ?? 0) + 1);
  vocab = m;
  return m;
}

export async function indexStats() {
  const rows = await db.searchDoc.groupBy({ by: ["kind"], _count: { _all: true } });
  return { byKind: Object.fromEntries(rows.map((r) => [r.kind, r._count._all])), ftsRows: await ftsCount(), lastSync: INDEX_STATS.lastSync, lastChanged: INDEX_STATS.lastChanged };
}

// ===================================================================== querying
type Ranked = { refId: string; score: number };
/** Strict AND first; if that finds nothing, relax to OR ("any word") so people still get something useful. */
async function rank(q: string, kinds: string[], limit: number): Promise<{ by: Record<string, Ranked[]>; relaxed: boolean }> {
  const out: Record<string, Ranked[]> = { BUSINESS: [], ARTICLE: [], EPISODE: [] };
  const run = async (mode: "all" | "any") => {
    const match = buildMatch(q, mode);
    if (!match) return 0;
    const hits = await ftsQuery(match, limit * 3);
    if (!hits.length) return 0;
    const docs = await db.searchDoc.findMany({ where: { rid: { in: hits.map((h) => h.rid) }, visible: true, liveFrom: { lte: new Date() }, kind: { in: kinds } } });
    const byRid = new Map(docs.map((d) => [d.rid, d]));
    for (const k of Object.keys(out)) out[k] = [];
    for (const h of hits) { const d = byRid.get(h.rid); if (d && out[d.kind].length < limit) out[d.kind].push({ refId: d.refId, score: h.score }); }
    return docs.length;
  };
  let n = await run("all"), relaxed = false;
  if (!n && contentTokens(q).length > 1) { n = await run("any"); relaxed = n > 0; }
  return { by: out, relaxed };
}

export type Filters = { category?: string; area?: string; minRating?: number; claimed?: boolean; openNow?: boolean };
export type SearchOpts = { q: string; filters?: Filters; sort?: "relevance" | "rating" | "reviews" | "name" | "nearest"; page?: number; perPage?: number; near?: LatLng | null; withContent?: boolean; log?: boolean };
type Biz = Awaited<ReturnType<typeof loadBusinesses>>[number];
export type BizResult = Biz & { score: number; distanceKm: number | null; approx: boolean; open: boolean | null };

async function loadBusinesses(ids: string[]) {
  const out: Awaited<ReturnType<typeof db.business.findMany<{ include: typeof businessInclude }>>> = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...(await db.business.findMany({ where: { id: { in: ids.slice(i, i + 500) }, published: true }, include: businessInclude })));
  return out;
}

function matches(b: BizResult, f: Filters, skip?: keyof Filters) {
  if (skip !== "category" && f.category && b.category.slug !== f.category) return false;
  if (skip !== "area" && f.area && b.location.slug !== f.area) return false;
  if (skip !== "minRating" && f.minRating && !(b.ratingAvg != null && b.ratingAvg >= f.minRating)) return false;
  if (skip !== "claimed" && f.claimed && !(b.claimStatus === "CLAIMED" || b.claimStatus === "VERIFIED")) return false;
  if (skip !== "openNow" && f.openNow && b.open !== true) return false;
  return true;
}
const tally = (list: BizResult[], key: (b: BizResult) => string | null) => { const m = new Map<string, number>(); for (const b of list) { const k = key(b); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return m; };

export async function searchAll(o: SearchOpts) {
  const q = o.q.trim().slice(0, 120);
  const f = o.filters ?? {};
  const perPage = o.perPage ?? 12, page = Math.max(1, o.page ?? 1);
  await syncIndex();

  let ranked: { by: Record<string, Ranked[]>; relaxed: boolean } = { by: { BUSINESS: [], ARTICLE: [], EPISODE: [] }, relaxed: false };
  let businesses: Biz[] = [];
  const score = new Map<string, number>();
  if (contentTokens(q).length) {
    ranked = await rank(q, o.withContent === false ? ["BUSINESS"] : ["BUSINESS", "ARTICLE", "EPISODE"], 500);
    for (const r of ranked.by.BUSINESS) score.set(r.refId, r.score);
    businesses = await loadBusinesses(ranked.by.BUSINESS.map((r) => r.refId));
  } else {
    // browse mode (no text): every published business, filtered/sorted below
    businesses = await db.business.findMany({ where: { published: true }, include: businessInclude, orderBy: { createdAt: "desc" }, take: 2000 });
  }
  const now = new Date();
  const all: BizResult[] = businesses.map((b) => {
    const p = businessPoint(b);
    const bonus = 1 + (b.claimStatus === "CLAIMED" || b.claimStatus === "VERIFIED" ? 0.05 : 0) + (b.ratingAvg ? b.ratingAvg * 0.01 : 0);
    return { ...b, score: (score.get(b.id) ?? 0) * bonus, distanceKm: o.near && p ? haversineKm(o.near, p.point) : null, approx: p?.approx ?? false, open: isOpenNow(b.openingHours, now) };
  });
  const filtered = all.filter((b) => matches(b, f));
  const sort = o.sort ?? (o.near && !contentTokens(q).length ? "nearest" : "relevance");
  const cmp: Record<string, (a: BizResult, b: BizResult) => number> = {
    relevance: (a, b) => b.score - a.score || (b.ratingCount - a.ratingCount) || a.name.localeCompare(b.name),
    rating: (a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || b.ratingCount - a.ratingCount || a.name.localeCompare(b.name),
    reviews: (a, b) => b.ratingCount - a.ratingCount || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    nearest: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.name.localeCompare(b.name),
  };
  filtered.sort(cmp[sort] ?? cmp.relevance);

  // facets: counts as if the facet's own filter weren't applied (so you can see what switching would give)
  const facets = {
    categories: [...tally(all.filter((b) => matches(b, f, "category")), (b) => b.category.slug)].map(([slug, n]) => ({ slug, name: all.find((b) => b.category.slug === slug)!.category.name, n })).sort((a, b) => b.n - a.n),
    areas: [...tally(all.filter((b) => matches(b, f, "area")), (b) => b.location.slug)].map(([slug, n]) => ({ slug, name: all.find((b) => b.location.slug === slug)!.location.name, n })).sort((a, b) => b.n - a.n),
    rating4: all.filter((b) => matches(b, f, "minRating") && (b.ratingAvg ?? 0) >= 4).length,
    rating3: all.filter((b) => matches(b, f, "minRating") && (b.ratingAvg ?? 0) >= 3).length,
    claimed: all.filter((b) => matches(b, f, "claimed") && (b.claimStatus === "CLAIMED" || b.claimStatus === "VERIFIED")).length,
    openNow: all.filter((b) => matches(b, f, "openNow") && b.open === true).length,
  };

  const total = filtered.length;
  const items = filtered.slice((page - 1) * perPage, page * perPage);

  let suggestion: string | null = null;
  if (contentTokens(q).length && (total === 0 || ranked.relaxed)) {
    const s = spellSuggest(q, await getVocab());
    if (s && s !== q.toLowerCase().trim()) suggestion = s;
  }

  let articles: { id: string; slug: string; type: string; title: string; standfirst: string; disclosure: string; isSample: boolean; publishedAt: Date | null; location: { name: string } | null }[] = [];
  let episodes: { id: string; slug: string; number: number; title: string; description: string; isSample: boolean; publishedAt: Date | null; videoUrl: string | null }[] = [];
  if (o.withContent !== false && page === 1) {
    const aIds = ranked.by.ARTICLE.slice(0, 6).map((r) => r.refId), eIds = ranked.by.EPISODE.slice(0, 4).map((r) => r.refId);
    if (aIds.length) { const rows = await db.article.findMany({ where: { id: { in: aIds }, status: "PUBLISHED" }, include: { location: true } }); articles = aIds.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as never; }
    if (eIds.length) { const rows = await db.podcastEpisode.findMany({ where: { id: { in: eIds }, status: "PUBLISHED" } }); episodes = eIds.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as never; }
  }

  // browse chips: areas / categories whose names match the query
  const toks = contentTokens(q);
  const [cats, locs] = toks.length ? await Promise.all([db.category.findMany(), db.location.findMany()]) : [[], []];
  const hit = (name: string) => { const n = name.toLowerCase(); return toks.some((t) => t.length >= 3 && (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(t)) || (t.length >= 4 && n.includes(t)))); };
  const matchedCategories = cats.filter((c) => hit(c.name)).slice(0, 4), matchedAreas = locs.filter((l) => hit(l.name)).slice(0, 4);

  if (q && o.log !== false) await logSearch(q, total + articles.length + episodes.length);
  return { q, total, items, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)), facets, sort, relaxed: ranked.relaxed, suggestion, articles, episodes, matchedCategories, matchedAreas };
}

// ===================================================================== suggestions + logging
export type Suggestion = { type: "business" | "category" | "area" | "article" | "episode"; label: string; sub?: string; href: string };
export async function suggest(q: string): Promise<Suggestion[]> {
  const toks = contentTokens(q);
  if (!toks.length || q.trim().length < 2) return [];
  await syncIndex();
  const out: Suggestion[] = [];
  const [cats, locs] = await Promise.all([db.category.findMany(), db.location.findMany()]);
  const starts = (n: string) => n.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(toks[toks.length - 1]));
  for (const c of cats.filter((c) => starts(c.name)).slice(0, 2)) out.push({ type: "category", label: c.name, sub: "Category", href: `/businesses/london/${c.slug}` });
  for (const l of locs.filter((l) => starts(l.name)).slice(0, 2)) out.push({ type: "area", label: l.name, sub: "Area", href: `/locations/${l.slug}` });
  const { by } = await rank(q, ["BUSINESS", "ARTICLE", "EPISODE"], 8);
  const bs = await loadBusinesses(by.BUSINESS.slice(0, 4).map((r) => r.refId));
  for (const r of by.BUSINESS.slice(0, 4)) { const b = bs.find((x) => x.id === r.refId); if (b) out.push({ type: "business", label: b.name, sub: `${b.category.name} · ${b.location.name}`, href: `/businesses/${b.city.slug}/${b.category.slug}/${b.slug}` }); }
  const as = await db.article.findMany({ where: { id: { in: by.ARTICLE.slice(0, 2).map((r) => r.refId) }, status: "PUBLISHED" } });
  for (const a of as) out.push({ type: "article", label: a.title, sub: ARTICLE_TYPES[a.type as ArticleType]?.label, href: `/${ARTICLE_TYPES[a.type as ArticleType].path}/${a.slug}` });
  const es = await db.podcastEpisode.findMany({ where: { id: { in: by.EPISODE.slice(0, 1).map((r) => r.refId) }, status: "PUBLISHED" } });
  for (const e of es) out.push({ type: "episode", label: e.title, sub: "Podcast", href: `/podcast/${e.slug}` });
  return out.slice(0, 8);
}

/** Anonymous aggregate query log (no IP, no user id). PII-looking queries are dropped. */
export async function logSearch(q: string, results: number) {
  const norm = loggableQuery(q);
  if (!norm) return;
  const day = new Date().toISOString().slice(0, 10);
  await db.searchTerm.upsert({ where: { day_q: { day, q: norm } }, create: { day, q: norm, count: 1, zeroCount: results === 0 ? 1 : 0 }, update: { count: { increment: 1 }, ...(results === 0 ? { zeroCount: { increment: 1 } } : {}) } }).catch(() => {});
}

export { AREA_CENTROIDS };
