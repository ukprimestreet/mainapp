import { db } from "./db";
import { isBotUA } from "./owner";

export const PREMIUM_FEATURES = [
  "Photo gallery (up to 8 images)", "Offer / announcement banner on your profile", "Enquiry form with leads in your dashboard and inbox", "Click analytics (website, phone, directions)",
] as const;
export const MAX_GALLERY = 8;

const today = () => new Date().toISOString().slice(0, 10);
const DAY = 86400_000;

// ------------------------------------------------------------------ entitlements
export type Entitlements = { premium: boolean; until: Date | null; source: "STRIPE" | "MANUAL" | null; status: string | null; cancelAtPeriodEnd: boolean };
/** Premium = an ACTIVE (or PAST_DUE within a 7-day grace) subscription whose paid period hasn't ended. Computed from the DB on every check. */
export async function getEntitlements(businessId: string, now = new Date()): Promise<Entitlements> {
  const subs = await db.subscription.findMany({ where: { businessId, status: { in: ["ACTIVE", "PAST_DUE"] } }, orderBy: { currentPeriodEnd: "desc" } });
  const live = subs.find((s) => (s.status === "ACTIVE" ? !s.currentPeriodEnd || s.currentPeriodEnd > now : !!s.currentPeriodEnd && s.currentPeriodEnd.getTime() + 7 * DAY > now.getTime()));
  return live ? { premium: true, until: live.currentPeriodEnd, source: live.provider as "STRIPE" | "MANUAL", status: live.status, cancelAtPeriodEnd: live.cancelAtPeriodEnd } : { premium: false, until: null, source: null, status: subs[0]?.status ?? null, cancelAtPeriodEnd: false };
}
export const isPremium = async (businessId: string) => (await getEntitlements(businessId)).premium;

export function parseGallery(json: string | null | undefined): string[] {
  try { const v = JSON.parse(json ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX_GALLERY) : []; } catch { return []; }
}

// ------------------------------------------------------------------ campaign selection (paid placements)
export type Slot = { categoryId?: string | null; locationId?: string | null };
/** Active, in-date, under cap, and matching the targeting (a null target = any). */
export async function activeCampaigns(kind: "FEATURED" | "AD", placement: string, slot: Slot, now = new Date()) {
  const rows = await db.campaign.findMany({
    where: {
      kind, status: "ACTIVE", placement, startsAt: { lte: now }, endsAt: { gte: now },
      AND: [{ OR: [{ categoryId: null }, ...(slot.categoryId ? [{ categoryId: slot.categoryId }] : [])] }, { OR: [{ locationId: null }, ...(slot.locationId ? [{ locationId: slot.locationId }] : [])] }],
    },
    include: { business: { include: { category: true, location: true, city: true } }, stats: true },
  });
  return rows.filter((c) => {
    if (c.kind === "FEATURED" && (!c.business || !c.business.published || c.business.isSample)) return false; // sample/unpublished can never be promoted
    const shown = c.stats.reduce((a, s) => a + s.impressions, 0);
    return !c.impressionCap || shown < c.impressionCap;
  });
}
/** Fair rotation: least-shown first, so every paying business gets its share; ties broken randomly. */
export function rotate<T extends { id: string; stats: { impressions: number }[] }>(cands: T[], limit: number, rnd = Math.random): T[] {
  return [...cands].map((c) => ({ c, shown: c.stats.reduce((a, s) => a + s.impressions, 0), r: rnd() })).sort((a, b) => a.shown - b.shown || a.r - b.r).slice(0, limit).map((x) => x.c);
}
export async function pickFeatured(slot: Slot, limit = 2) { return rotate(await activeCampaigns("FEATURED", "LISTING", slot), limit); }
export async function pickAd(placement: "HOME" | "ARTICLE" | "PODCAST", slot: Slot = {}) { return rotate(await activeCampaigns("AD", placement, slot), 1)[0] ?? null; }

export async function recordImpressions(ids: string[], ua: string | null) {
  if (isBotUA(ua) || !ids.length) return;
  const day = today();
  for (const campaignId of ids) await db.campaignStat.upsert({ where: { campaignId_day: { campaignId, day } }, create: { campaignId, day, impressions: 1 }, update: { impressions: { increment: 1 } } }).catch(() => {});
}
export async function recordCampaignClick(campaignId: string, ua: string | null) {
  if (isBotUA(ua)) return;
  const day = today();
  await db.campaignStat.upsert({ where: { campaignId_day: { campaignId, day } }, create: { campaignId, day, clicks: 1 }, update: { clicks: { increment: 1 } } }).catch(() => {});
}
export async function recordBusinessClick(businessId: string, kind: string, ua: string | null) {
  if (isBotUA(ua)) return;
  const day = today();
  await db.businessClick.upsert({ where: { businessId_kind_day: { businessId, kind, day } }, create: { businessId, kind, day, count: 1 }, update: { count: { increment: 1 } } }).catch(() => {});
}
export async function clicks30(businessId: string) {
  const since = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const rows = await db.businessClick.groupBy({ by: ["kind"], where: { businessId, day: { gte: since } }, _sum: { count: true } });
  return Object.fromEntries(["website", "phone", "directions"].map((k) => [k, rows.find((r) => r.kind === k)?._sum.count ?? 0])) as Record<"website" | "phone" | "directions", number>;
}

export const campaignTotals = (stats: { impressions: number; clicks: number }[]) => {
  const impressions = stats.reduce((a, s) => a + s.impressions, 0), clicks = stats.reduce((a, s) => a + s.clicks, 0);
  return { impressions, clicks, ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0 };
};
export const gbp = (pence: number) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;
/** Monthly-equivalent value of a product (for MRR). */
export const monthlyPence = (p: { pricePence: number; interval: string }) => (p.interval === "YEAR" ? Math.round(p.pricePence / 12) : p.interval === "MONTH" ? p.pricePence : 0);
