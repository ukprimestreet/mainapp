import { db } from "./db";
import { monthlyPence } from "./commerce";

/**
 * Metrics for the Phase 3 membership/business analytics module (`/admin/membership`).
 *
 * Builds on the same tables Growth and Finance already read — `Subscription`, `Order`, `Business`,
 * `ClaimRequest` — nothing new is modelled. Where the brief implies something the platform cannot yet
 * measure (cancellation reason, true LTV cohort projection beyond observed data), the function says so
 * explicitly rather than guessing. See admin-dashboard-audit.md §12 for the full list.
 */

// ---------------------------------------------------------------- membership mix
export type PlanRow = { productKey: string; productName: string; active: number; pastDue: number; canceled: number; mrrPence: number };
export async function membershipMix(): Promise<PlanRow[]> {
  const [subs, products] = await Promise.all([
    db.subscription.findMany({ select: { productKey: true, status: true } }),
    db.product.findMany({ where: { kind: "PREMIUM" } }),
  ]);
  return products.map((p) => {
    const rows = subs.filter((s) => s.productKey === p.key);
    const active = rows.filter((r) => r.status === "ACTIVE").length;
    return {
      productKey: p.key, productName: p.name,
      active, pastDue: rows.filter((r) => r.status === "PAST_DUE").length, canceled: rows.filter((r) => r.status === "CANCELED").length,
      mrrPence: active * monthlyPence(p),
    };
  });
}

// ---------------------------------------------------------------- segmentation
export type SegmentRow = { label: string; payingCount: number; mrrPence: number };

/** Paying (ACTIVE/PAST_DUE) businesses grouped by category, richest first. */
export async function segmentByCategory(limit = 10): Promise<SegmentRow[]> {
  const [subs, products, businesses, categories] = await Promise.all([
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } }, select: { businessId: true, productKey: true } }),
    db.product.findMany(),
    db.business.findMany({ select: { id: true, categoryId: true } }),
    db.category.findMany({ select: { id: true, name: true } }),
  ]);
  return groupSegments(subs, products, businesses, categories, (b) => b.categoryId).slice(0, limit);
}

/** Same, grouped by location. */
export async function segmentByLocation(limit = 10): Promise<SegmentRow[]> {
  const [subs, products, businesses, locations] = await Promise.all([
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } }, select: { businessId: true, productKey: true } }),
    db.product.findMany(),
    db.business.findMany({ select: { id: true, locationId: true } }),
    db.location.findMany({ select: { id: true, name: true } }),
  ]);
  return groupSegments(subs, products, businesses, locations, (b) => b.locationId).slice(0, limit);
}

function groupSegments<B extends { id: string }>(
  subs: { businessId: string; productKey: string }[],
  products: { key: string; pricePence: number; interval: string }[],
  businesses: B[],
  groups: { id: string; name: string }[],
  groupIdOf: (b: B) => string,
): SegmentRow[] {
  const priceOf = new Map(products.map((p) => [p.key, p]));
  const groupIdByBusiness = new Map(businesses.map((b) => [b.id, groupIdOf(b)]));
  const nameOf = new Map(groups.map((g) => [g.id, g.name]));
  const totals = new Map<string, { count: number; mrr: number }>();
  for (const s of subs) {
    const gid = groupIdByBusiness.get(s.businessId);
    if (!gid) continue;
    const t = totals.get(gid) ?? { count: 0, mrr: 0 };
    t.count += 1;
    const p = priceOf.get(s.productKey);
    t.mrr += p ? monthlyPence(p) : 0;
    totals.set(gid, t);
  }
  return [...totals.entries()]
    .map(([gid, t]) => ({ label: nameOf.get(gid) ?? "Unknown", payingCount: t.count, mrrPence: t.mrr }))
    .sort((a, b) => b.mrrPence - a.mrrPence);
}

// ---------------------------------------------------------------- claim funnel
export type ClaimFunnel = { unclaimed: number; pending: number; claimed: number; verified: number; payingAmongClaimed: number; claimedOrVerifiedTotal: number };
/** Of businesses that have been claimed or verified, how many are currently paying — the step the brief calls "claim → paying conversion". */
export async function claimFunnel(): Promise<ClaimFunnel> {
  const [counts, claimedIds, payingIds] = await Promise.all([
    db.business.groupBy({ by: ["claimStatus"], _count: true }),
    db.business.findMany({ where: { claimStatus: { in: ["CLAIMED", "VERIFIED"] } }, select: { id: true } }),
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } }, select: { businessId: true } }),
  ]);
  const byStatus = (s: string) => counts.find((c) => c.claimStatus === s)?._count ?? 0;
  const payingSet = new Set(payingIds.map((p) => p.businessId));
  const claimedOrVerifiedTotal = claimedIds.length;
  const payingAmongClaimed = claimedIds.filter((b) => payingSet.has(b.id)).length;
  return { unclaimed: byStatus("UNCLAIMED"), pending: byStatus("PENDING"), claimed: byStatus("CLAIMED"), verified: byStatus("VERIFIED"), payingAmongClaimed, claimedOrVerifiedTotal };
}

// ---------------------------------------------------------------- retention / cohorts
export type Cohort = { month: string; started: number; stillRetained: number; retainedPct: number };
/** Monthly cohorts by subscription start month: of those started in month X, how many are still ACTIVE/PAST_DUE today. */
export async function monthlyCohorts(monthsBack = 6, now = new Date()): Promise<Cohort[]> {
  const subs = await db.subscription.findMany({ select: { createdAt: true, status: true } });
  const cohorts: Cohort[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inCohort = subs.filter((s) => s.createdAt >= start && s.createdAt < end);
    const retained = inCohort.filter((s) => s.status === "ACTIVE" || s.status === "PAST_DUE").length;
    cohorts.push({ month: start.toISOString().slice(0, 7), started: inCohort.length, stillRetained: retained, retainedPct: inCohort.length ? Math.round((retained / inCohort.length) * 100) : 0 });
  }
  return cohorts;
}

// ---------------------------------------------------------------- lifetime value (observed, not projected)
export type LifetimeStats = { canceledCount: number; avgLifetimeMonths: number | null; avgLtvPence: number | null };
/**
 * Average observed lifetime of CANCELED subscriptions (createdAt → updatedAt, the moment status flipped to
 * CANCELED) times their product's monthly price. This is what has actually happened, not a projection —
 * with too few cancellations the average is unstable, so `avgLifetimeMonths` is null below a small sample.
 */
export async function lifetimeStats(minSample = 3): Promise<LifetimeStats> {
  const [canceled, products] = await Promise.all([
    db.subscription.findMany({ where: { status: "CANCELED" }, select: { createdAt: true, updatedAt: true, productKey: true } }),
    db.product.findMany(),
  ]);
  if (canceled.length < minSample) return { canceledCount: canceled.length, avgLifetimeMonths: null, avgLtvPence: null };
  const priceOf = new Map(products.map((p) => [p.key, p]));
  const DAY = 86400_000;
  let totalMonths = 0, totalLtv = 0;
  for (const s of canceled) {
    const months = Math.max((s.updatedAt.getTime() - s.createdAt.getTime()) / (30 * DAY), 0);
    totalMonths += months;
    const p = priceOf.get(s.productKey);
    totalLtv += p ? months * monthlyPence(p) : 0;
  }
  return { canceledCount: canceled.length, avgLifetimeMonths: Math.round((totalMonths / canceled.length) * 10) / 10, avgLtvPence: Math.round(totalLtv / canceled.length) };
}

// ---------------------------------------------------------------- top paying businesses
export type TopBusiness = { id: string; name: string; category: string; location: string; totalPence: number; status: string };
/** All-time PAID revenue (ex VAT) per business, richest first. */
export async function topPayingBusinesses(limit = 10): Promise<TopBusiness[]> {
  const grouped = await db.order.groupBy({ by: ["businessId"], where: { status: "PAID" }, _sum: { amountPence: true, vatPence: true } });
  const ranked = grouped
    .map((g) => ({ businessId: g.businessId, totalPence: (g._sum.amountPence ?? 0) - (g._sum.vatPence ?? 0) }))
    .sort((a, b) => b.totalPence - a.totalPence)
    .slice(0, limit);
  const businesses = await db.business.findMany({ where: { id: { in: ranked.map((r) => r.businessId) } }, include: { category: true, location: true } });
  const byId = new Map(businesses.map((b) => [b.id, b]));
  return ranked.map((r) => {
    const b = byId.get(r.businessId);
    return { id: r.businessId, name: b?.name ?? "Unknown", category: b?.category.name ?? "—", location: b?.location.name ?? "—", totalPence: r.totalPence, status: b?.claimStatus ?? "—" };
  });
}
