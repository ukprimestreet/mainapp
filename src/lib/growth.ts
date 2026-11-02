import { db } from "./db";
import { monthlyPence } from "./commerce";
import { CREDIT_PRODUCT_KEY } from "./credits";

/**
 * Metrics for the Growth dashboard (`/admin/growth`), Phase 1 of `admin-dashboard-audit.md`.
 *
 * Every figure here is counted from the same tables `/admin/money` already reads — nothing is modelled or
 * estimated. Where the brief asks for something the platform cannot yet measure (lead delivery, lead
 * validity, advertising revenue, cash balance), the function returns an explicit "not available" shape
 * instead of a fabricated number. See §4 of the audit for the exact definition of every metric below.
 */

// ---------------------------------------------------------------- date ranges
export const RANGE_KEYS = ["today", "7d", "30d", "this_month", "last_month", "this_year", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const isRangeKey = (v: string | undefined): v is RangeKey => !!v && (RANGE_KEYS as readonly string[]).includes(v);

export type Range = {
  key: RangeKey;
  label: string;
  from: Date;
  to: Date;
  /** The equal-length (or equal-calendar-unit) period immediately before `from`, for a % comparison. */
  prevFrom: Date;
  prevTo: Date;
  /** False when comparing a partial period (e.g. "this month" so far) against a full one would mislead. */
  comparable: boolean;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);

/** Parses `?range=` and, for `custom`, `?from=&to=` (YYYY-MM-DD) into a resolved window. Falls back to 30d. */
export function resolveRange(params: { range?: string; from?: string; to?: string }, now = new Date()): Range {
  const key: RangeKey = isRangeKey(params.range) ? params.range : "30d";
  const to = now;

  if (key === "today") {
    const from = startOfDay(now);
    const len = to.getTime() - from.getTime();
    return { key, label: "Today", from, to, prevFrom: new Date(from.getTime() - len), prevTo: from, comparable: false };
  }
  if (key === "7d") {
    const from = new Date(now.getTime() - 7 * 86400_000);
    return { key, label: "Last 7 days", from, to, prevFrom: new Date(from.getTime() - 7 * 86400_000), prevTo: from, comparable: true };
  }
  if (key === "this_month") {
    const from = startOfMonth(now);
    const prevFrom = startOfMonth(new Date(from.getTime() - 1));
    return { key, label: "This month", from, to, prevFrom, prevTo: from, comparable: false };
  }
  if (key === "last_month") {
    const thisMonthStart = startOfMonth(now);
    const from = startOfMonth(new Date(thisMonthStart.getTime() - 1));
    const prevFrom = startOfMonth(new Date(from.getTime() - 1));
    return { key, label: "Last month", from, to: thisMonthStart, prevFrom, prevTo: from, comparable: true };
  }
  if (key === "this_year") {
    const from = startOfYear(now);
    const prevFrom = startOfYear(new Date(from.getTime() - 1));
    return { key, label: "This year", from, to, prevFrom, prevTo: from, comparable: false };
  }
  if (key === "custom" && params.from && params.to) {
    const from = startOfDay(new Date(params.from));
    const to = new Date(startOfDay(new Date(params.to)).getTime() + 86400_000); // inclusive of the end day
    const len = to.getTime() - from.getTime();
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && len > 0) {
      return { key, label: "Custom range", from, to, prevFrom: new Date(from.getTime() - len), prevTo: from, comparable: true };
    }
  }
  // default: last 30 days
  const from = new Date(now.getTime() - 30 * 86400_000);
  return { key: "30d", label: "Last 30 days", from, to, prevFrom: new Date(from.getTime() - 30 * 86400_000), prevTo: from, comparable: true };
}

/** % change, or null when there's nothing comparable — never fabricated as 0%. */
export function deltaPct(current: number, previous: number, comparable: boolean): number | null {
  if (!comparable || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------------------------------------------------------------- revenue
export type RevenueBreakdown = {
  total: number;
  memberships: number;
  featured: number;
  sponsorships: number;
  /** Lead-credit purchases (`Order.productKey === CREDIT_PRODUCT_KEY`) — real Stripe revenue, found to be
   * silently mislabelled as "Featured listings" until this was corrected (credits are sold under their own
   * product key, deliberately not a row in `Product`, so the old `kindOf.get(...)` lookup always missed). */
  leadCredits: number;
  /** VAT collected on top of `total` — never part of revenue. 0 while VAT is off (the default). */
  vatCollected: number;
  /** Streams the platform cannot currently price: advertising and partnerships. */
  untracked: { label: string; note: string }[];
};

/** Ex VAT — VAT collected is reported separately below and must never be counted as revenue. */
export async function revenueInRange(from: Date, to: Date): Promise<RevenueBreakdown> {
  const [orders, products, sponsorships] = await Promise.all([
    db.order.findMany({ where: { status: "PAID", paidAt: { gte: from, lt: to } }, select: { amountPence: true, vatPence: true, productKey: true } }),
    db.product.findMany({ select: { key: true, kind: true } }),
    db.sponsorship.findMany({ where: { invoiced: true, createdAt: { gte: from, lt: to } }, select: { pricePence: true } }),
  ]);
  const kindOf = new Map(products.map((p) => [p.key, p.kind]));
  let memberships = 0, featured = 0, leadCredits = 0, vatCollected = 0;
  for (const o of orders) {
    const exVat = o.amountPence - o.vatPence;
    vatCollected += o.vatPence;
    if (o.productKey === CREDIT_PRODUCT_KEY) leadCredits += exVat;
    else if (kindOf.get(o.productKey) === "PREMIUM") memberships += exVat;
    else featured += exVat; // FEATURED, or an unknown/retired product key — still counted, just not mis-labelled as membership
  }
  const sponsorshipTotal = sponsorships.reduce((a, s) => a + s.pricePence, 0);
  return {
    total: memberships + featured + sponsorshipTotal + leadCredits,
    memberships, featured, sponsorships: sponsorshipTotal, leadCredits, vatCollected,
    untracked: [
      { label: "Advertising", note: "Campaign impressions/clicks are recorded; no price or payment is stored against an AD campaign yet." },
      { label: "Partnerships", note: "SalesEnquiry captures interest, not a priced deal." },
    ],
  };
}

// ---------------------------------------------------------------- MRR & paying businesses
export async function mrrNow(): Promise<{ pence: number; activePlans: number }> {
  const [subs, products] = await Promise.all([
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } }, select: { productKey: true } }),
    db.product.findMany(),
  ]);
  const price = new Map(products.map((p) => [p.key, p]));
  const pence = subs.reduce((a, s) => a + (price.get(s.productKey) ? monthlyPence(price.get(s.productKey)!) : 0), 0);
  return { pence, activePlans: subs.length };
}

/** Distinct businesses with a live subscription or any PAID order, as of `asOf`. */
export async function payingBusinessCount(asOf: Date): Promise<number> {
  const [subBiz, orderBiz] = await Promise.all([
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] }, createdAt: { lte: asOf } }, select: { businessId: true } }),
    db.order.findMany({ where: { status: "PAID", paidAt: { lte: asOf } }, select: { businessId: true } }),
  ]);
  return new Set([...subBiz.map((s) => s.businessId), ...orderBiz.map((o) => o.businessId)]).size;
}

/** Businesses whose first-ever PAID order or subscription falls inside [from, to). */
export async function newPayingBusinesses(from: Date, to: Date): Promise<number> {
  const [firstOrderByBiz, firstSubByBiz] = await Promise.all([
    db.order.groupBy({ by: ["businessId"], where: { status: "PAID" }, _min: { paidAt: true } }),
    db.subscription.groupBy({ by: ["businessId"], where: { status: { in: ["ACTIVE", "PAST_DUE", "CANCELED"] } }, _min: { createdAt: true } }),
  ]);
  const firstEverByBiz = new Map<string, number>();
  for (const r of firstOrderByBiz) if (r._min.paidAt) firstEverByBiz.set(r.businessId, Math.min(firstEverByBiz.get(r.businessId) ?? Infinity, r._min.paidAt.getTime()));
  for (const r of firstSubByBiz) if (r._min.createdAt) firstEverByBiz.set(r.businessId, Math.min(firstEverByBiz.get(r.businessId) ?? Infinity, r._min.createdAt.getTime()));
  let n = 0;
  for (const t of firstEverByBiz.values()) if (t >= from.getTime() && t < to.getTime()) n++;
  return n;
}

/** (subscriptions that became ACTIVE in range) − (subscriptions that became CANCELED in range). */
export async function netMembershipGrowth(from: Date, to: Date): Promise<{ started: number; cancelled: number; net: number }> {
  const [started, cancelled] = await Promise.all([
    db.subscription.count({ where: { createdAt: { gte: from, lt: to } } }),
    db.subscription.count({ where: { status: "CANCELED", updatedAt: { gte: from, lt: to } } }),
  ]);
  return { started, cancelled, net: started - cancelled };
}

// ---------------------------------------------------------------- leads
export async function leadsSubmitted(from: Date, to: Date): Promise<number> {
  return db.lead.count({ where: { createdAt: { gte: from, lt: to } } });
}

// ---------------------------------------------------------------- expenses (writer payments + the Phase 2 Expense ledger)
export async function recordedExpenses(from: Date, to: Date): Promise<{ pence: number; note: string }> {
  const [writerRows, expenseRows] = await Promise.all([
    db.writerPayment.findMany({
      where: { status: { in: ["APPROVED", "PAID"] }, OR: [{ paidAt: { gte: from, lt: to } }, { paidAt: null, createdAt: { gte: from, lt: to } }] },
      select: { amountPence: true },
    }),
    db.expense.findMany({ where: { date: { gte: from, lt: to } }, select: { amountPence: true } }),
  ]);
  const pence = writerRows.reduce((a, r) => a + r.amountPence, 0) + expenseRows.reduce((a, r) => a + r.amountPence, 0);
  return { pence, note: "Writer payments plus manually recorded expenses — see /admin/finance for the breakdown." };
}

// ---------------------------------------------------------------- revenue target
export const TARGET_SETTING_KEY = "revenue.monthly_target_pence";
export async function monthlyTargetPence(): Promise<number | null> {
  const row = await db.setting.findUnique({ where: { key: TARGET_SETTING_KEY } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// ---------------------------------------------------------------- alerts (lightweight; full system is Phase 8)
export type GrowthAlert = { tone: "warn" | "bad"; title: string; detail: string; href: string };
export async function basicAlerts(): Promise<GrowthAlert[]> {
  const [failedOrders, pastDue, claims] = await Promise.all([
    db.order.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
    db.subscription.findMany({ where: { status: "PAST_DUE" }, select: { id: true } }),
    db.claimRequest.count({ where: { status: { in: ["PENDING", "NEEDS_INFO"] } } }),
  ]);
  const alerts: GrowthAlert[] = [];
  if (failedOrders > 0) alerts.push({ tone: "bad", title: `${failedOrders} failed payment${failedOrders === 1 ? "" : "s"} in the last 7 days`, detail: "Recovering an existing customer costs far less than finding a new one.", href: "/admin/money" });
  if (pastDue.length > 0) alerts.push({ tone: "warn", title: `${pastDue.length} membership${pastDue.length === 1 ? "" : "s"} past due`, detail: "These are still counted as paying while in the 7-day grace period.", href: "/admin/money" });
  if (claims > 0) alerts.push({ tone: "warn", title: `${claims} business claim${claims === 1 ? "" : "s"} waiting`, detail: "Unreviewed claims delay an owner getting access to paid features.", href: "/admin/claims" });
  return alerts;
}
