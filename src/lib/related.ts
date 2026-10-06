import { db } from "./db";
import { businessPoint, haversineKm } from "./geo";
import { businessInclude, parseJson } from "./queries";
import { contentTokens } from "./search/text";

// ---------------------------------------------------------------- scoring (pure, unit-tested)
type B = { id: string; categoryId: string; locationId: string; services: string | null; ratingAvg: number | null; claimStatus: string; isSample: boolean; lat: number | null; lng: number | null; location: { lat: number | null; lng: number | null; slug: string } };
const svc = (b: { services: string | null }) => new Set(parseJson<string[]>(b.services, []).map((s) => s.toLowerCase()));

/** Higher = more similar. Same category and area dominate; shared services, proximity, rating and a claimed profile break ties. */
export function similarityScore(base: B, c: B): number {
  let s = 0;
  if (c.categoryId === base.categoryId) s += 4;
  if (c.locationId === base.locationId) s += 3;
  const a = svc(base), b = svc(c);
  s += Math.min(3, [...a].filter((x) => b.has(x)).length);
  const p1 = businessPoint(base), p2 = businessPoint(c);
  if (p1 && p2) s += Math.max(0, 2 - haversineKm(p1.point, p2.point) / 4); // within ~8 km earns up to +2
  if (c.ratingAvg) s += c.ratingAvg * 0.2;
  if (c.claimStatus === "CLAIMED" || c.claimStatus === "VERIFIED") s += 0.5;
  return s;
}

type A = { id: string; type: string; locationId: string | null; title: string; publishedAt: Date | null; isSample: boolean; businesses: { businessId: string }[] };
export function articleSimilarity(base: A, c: A, now = Date.now()): number {
  const shared = c.businesses.filter((x) => base.businesses.some((y) => y.businessId === x.businessId)).length;
  let s = shared * 5;
  if (base.locationId && c.locationId === base.locationId) s += 3;
  if (c.type === base.type) s += 1;
  const bt = new Set(contentTokens(base.title));
  s += contentTokens(c.title).filter((t) => bt.has(t)).length * 1.5;
  if (c.publishedAt) s += Math.max(0, 1 - (now - c.publishedAt.getTime()) / (180 * 86400_000)); // up to +1 for fresh pieces
  return s;
}

// ---------------------------------------------------------------- queries
export async function relatedBusinesses(base: B & { id: string }, take = 6) {
  const cands = await db.business.findMany({
    where: { id: { not: base.id }, published: true, isSample: base.isSample, OR: [{ categoryId: base.categoryId }, { locationId: base.locationId }] },
    include: businessInclude, take: 80,
  });
  return cands.map((c) => ({ c, s: similarityScore(base, c) })).sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name)).slice(0, take).map((x) => x.c);
}

export async function relatedArticles(base: A, take = 3) {
  const cands = await db.article.findMany({
    where: { id: { not: base.id }, status: "PUBLISHED", isSample: base.isSample, publishedAt: { lte: new Date() } },
    orderBy: { publishedAt: "desc" }, take: 80, include: { author: true, location: true, businesses: { select: { businessId: true } } },
  });
  return cands.map((c) => ({ c, s: articleSimilarity(base, c) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, take).map((x) => x.c);
}

export async function relatedEpisodes(base: { id: string; businessId: string | null; guestName: string | null; isSample: boolean }, take = 3) {
  const cands = await db.podcastEpisode.findMany({ where: { id: { not: base.id }, status: "PUBLISHED", isSample: base.isSample, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" }, take: 40 });
  const score = (e: (typeof cands)[number]) => (base.businessId && e.businessId === base.businessId ? 5 : 0) + (base.guestName && e.guestName === base.guestName ? 4 : 0);
  return cands.map((e) => ({ e, s: score(e) })).sort((a, b) => b.s - a.s || (b.e.publishedAt?.getTime() ?? 0) - (a.e.publishedAt?.getTime() ?? 0)).slice(0, take).map((x) => x.e);
}

/**
 * Personalised picks WITHOUT accounts or tracking: the visitor's own saved + recently-viewed ids (from their cookies) decide
 * which categories/areas they seem interested in; we return similar businesses they haven't saved. Nothing is stored.
 */
export async function recommendFor(savedIds: string[], recentIds: string[], take = 6) {
  const seed = [...new Set([...savedIds, ...recentIds])];
  if (!seed.length) return { items: [], because: null as string | null };
  const seeds = await db.business.findMany({ where: { id: { in: seed }, published: true }, include: { location: true, category: true } });
  if (!seeds.length) return { items: [], because: null };
  const w = (id: string) => (savedIds.includes(id) ? 3 : 1);
  const catW = new Map<string, number>(), locW = new Map<string, number>();
  for (const s of seeds) { catW.set(s.categoryId, (catW.get(s.categoryId) ?? 0) + w(s.id)); locW.set(s.locationId, (locW.get(s.locationId) ?? 0) + w(s.id)); }
  const real = seeds.some((s) => !s.isSample) ? false : true; // sample visitors get sample picks; real visitors only real ones
  const cands = await db.business.findMany({
    where: { published: true, isSample: real, id: { notIn: savedIds }, OR: [{ categoryId: { in: [...catW.keys()] } }, { locationId: { in: [...locW.keys()] } }] },
    include: businessInclude, take: 120,
  });
  const scored = cands.map((c) => ({ c, s: (catW.get(c.categoryId) ?? 0) * 2 + (locW.get(c.locationId) ?? 0) + (c.ratingAvg ?? 0) * 0.3 + (c.claimStatus === "VERIFIED" || c.claimStatus === "CLAIMED" ? 0.5 : 0) + (recentIds.includes(c.id) ? -2 : 0) }))
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name)).slice(0, take);
  const top = seeds.find((s) => savedIds.includes(s.id)) ?? seeds[0];
  return { items: scored.map((x) => x.c), because: savedIds.includes(top.id) ? `you saved ${top.name}` : `you looked at ${top.name}` };
}
