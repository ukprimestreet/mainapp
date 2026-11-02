import { db } from "./db";

/**
 * Metrics for the Phase 5 sales CRM module (`/admin/sales`).
 *
 * Builds entirely on `SalesEnquiry` (commerce/advertising/partnership enquiries) plus the Phase 5 schema
 * addition of `assignedToId`/`followUpAt`/`closedAt` — see `scripts/ddl-sales-crm.ts`. Where the brief asks
 * for something the platform cannot measure (acquisition cost — no ad-spend/marketing-cost record exists
 * anywhere in the system), the function says so explicitly rather than guessing. See
 * admin-dashboard-audit.md for the full list of what Phase 5 does and does not cover.
 */

const OPEN = ["NEW", "CONTACTED"] as const;

// ---------------------------------------------------------------- pipeline by stage
export type StageRow = { status: string; count: number };
export async function pipelineByStage(): Promise<StageRow[]> {
  const rows = await db.salesEnquiry.groupBy({ by: ["status"], _count: true });
  const byStatus = new Map(rows.map((r) => [r.status, r._count]));
  return ["NEW", "CONTACTED", "WON", "LOST"].map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
}

// ---------------------------------------------------------------- conversion
export type ConversionStats = { won: number; lost: number; open: number; winRatePct: number | null };
/** Win rate among *closed* deals only (won / (won + lost)) — open deals aren't a loss or a win yet. */
export async function conversionStats(): Promise<ConversionStats> {
  const rows = await db.salesEnquiry.groupBy({ by: ["status"], _count: true });
  const byStatus = new Map(rows.map((r) => [r.status, r._count]));
  const won = byStatus.get("WON") ?? 0, lost = byStatus.get("LOST") ?? 0;
  const open = (byStatus.get("NEW") ?? 0) + (byStatus.get("CONTACTED") ?? 0);
  return { won, lost, open, winRatePct: won + lost > 0 ? (won / (won + lost)) * 100 : null };
}

// ---------------------------------------------------------------- time to close
export type TimeToClose = { avgDaysWon: number | null; avgDaysLost: number | null };
/** Average days from createdAt to closedAt, for deals that actually have a closedAt recorded. */
export async function timeToClose(): Promise<TimeToClose> {
  const closed = await db.salesEnquiry.findMany({ where: { closedAt: { not: null }, status: { in: ["WON", "LOST"] } }, select: { status: true, createdAt: true, closedAt: true } });
  const avg = (rows: typeof closed) => rows.length === 0 ? null : rows.reduce((a, r) => a + (r.closedAt!.getTime() - r.createdAt.getTime()), 0) / rows.length / 86_400_000;
  return { avgDaysWon: avg(closed.filter((r) => r.status === "WON")), avgDaysLost: avg(closed.filter((r) => r.status === "LOST")) };
}

// ---------------------------------------------------------------- by interest type
export type InterestRow = { interest: string; total: number; won: number; lost: number; winRatePct: number | null };
export async function byInterest(): Promise<InterestRow[]> {
  const rows = await db.salesEnquiry.findMany({ select: { interest: true, status: true } });
  const groups = new Map<string, { total: number; won: number; lost: number }>();
  for (const r of rows) {
    const g = groups.get(r.interest) ?? { total: 0, won: 0, lost: 0 };
    g.total++;
    if (r.status === "WON") g.won++;
    if (r.status === "LOST") g.lost++;
    groups.set(r.interest, g);
  }
  return [...groups.entries()]
    .map(([interest, g]) => ({ interest, total: g.total, won: g.won, lost: g.lost, winRatePct: g.won + g.lost > 0 ? (g.won / (g.won + g.lost)) * 100 : null }))
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------- by owner
export type OwnerRow = { ownerId: string | null; ownerName: string; open: number; won: number; lost: number; overdueFollowUps: number };
/** Deals grouped by assigned sales owner. Unassigned deals are grouped together as "Unassigned". */
export async function byOwner(now = new Date()): Promise<OwnerRow[]> {
  const rows = await db.salesEnquiry.findMany({ select: { assignedToId: true, assignedTo: { select: { name: true } }, status: true, followUpAt: true } });
  const groups = new Map<string, OwnerRow>();
  for (const r of rows) {
    const key = r.assignedToId ?? "__unassigned__";
    const g = groups.get(key) ?? { ownerId: r.assignedToId, ownerName: r.assignedTo?.name ?? "Unassigned", open: 0, won: 0, lost: 0, overdueFollowUps: 0 };
    if (r.status === "NEW" || r.status === "CONTACTED") g.open++;
    if (r.status === "WON") g.won++;
    if (r.status === "LOST") g.lost++;
    if (r.followUpAt && r.followUpAt < now && (r.status === "NEW" || r.status === "CONTACTED")) g.overdueFollowUps++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.open - a.open);
}

// ---------------------------------------------------------------- overdue follow-ups
export type OverdueEnquiry = { id: string; name: string; company: string | null; interest: string; status: string; followUpAt: Date; ownerName: string };
/** Open deals whose follow-up date has passed, oldest first — the thing a sales admin should act on today. */
export async function overdueFollowUps(now = new Date()): Promise<OverdueEnquiry[]> {
  const rows = await db.salesEnquiry.findMany({
    where: { followUpAt: { lt: now }, status: { in: [...OPEN] } },
    orderBy: { followUpAt: "asc" },
    select: { id: true, name: true, company: true, interest: true, status: true, followUpAt: true, assignedTo: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, company: r.company, interest: r.interest, status: r.status, followUpAt: r.followUpAt!, ownerName: r.assignedTo?.name ?? "Unassigned" }));
}
