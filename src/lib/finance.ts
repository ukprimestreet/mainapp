import { db } from "./db";
import { revenueInRange, type RevenueBreakdown } from "./growth";
import { formatRate, vatSettings } from "./vat";

/**
 * Metrics for the Phase 2 finance module (`/admin/finance`). Builds on `revenueInRange` from growth.ts so
 * the two dashboards never disagree on what "revenue" means.
 */
export { revenueInRange };
export type { RevenueBreakdown };

export async function vatStatus() {
  const v = await vatSettings();
  return { ...v, rateLabel: formatRate(v.rateBp) };
}

export type FinanceOrderRow = { id: string; businessName: string; productKey: string; amountPence: number; vatPence: number; source: string; status: string; date: Date | null };

async function withBusinessNames(orders: { id: string; businessId: string; productKey: string; amountPence: number; vatPence: number; source: string; status: string; paidAt: Date | null; createdAt: Date }[]): Promise<FinanceOrderRow[]> {
  const businesses = await db.business.findMany({ where: { id: { in: [...new Set(orders.map((o) => o.businessId))] } }, select: { id: true, name: true } });
  const nameOf = new Map(businesses.map((b) => [b.id, b.name]));
  return orders.map((o) => ({ id: o.id, businessName: nameOf.get(o.businessId) ?? "Unknown", productKey: o.productKey, amountPence: o.amountPence, vatPence: o.vatPence, source: o.source, status: o.status, date: o.paidAt ?? o.createdAt }));
}

/** Failed Stripe payments in range — recovering these costs less than finding a new customer. */
export async function failedPayments(from: Date, to: Date): Promise<FinanceOrderRow[]> {
  const rows = await db.order.findMany({ where: { status: "FAILED", createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "desc" }, take: 200 });
  return withBusinessNames(rows);
}

/** Refunds recorded via the admin "mark refunded" action (see finance-actions.ts) — not auto-matched from Stripe. */
export async function refundedOrders(from: Date, to: Date): Promise<FinanceOrderRow[]> {
  const rows = await db.order.findMany({ where: { status: "REFUNDED", createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "desc" }, take: 200 });
  return withBusinessNames(rows);
}

/** Sponsorships agreed (ACTIVE/DONE) but not yet marked invoiced — money owed, not yet billed. */
export async function outstandingInvoices(): Promise<{ id: string; sponsorName: string; kind: string; pricePence: number; status: string }[]> {
  const rows = await db.sponsorship.findMany({ where: { invoiced: false, status: { in: ["ACTIVE", "DONE"] }, pricePence: { gt: 0 } }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ id: r.id, sponsorName: r.sponsorName, kind: r.kind, pricePence: r.pricePence, status: r.status }));
}

export type ExpenseRow = { id: string; category: string; description: string; amountPence: number; date: Date; recurring: boolean };
export async function expensesInRange(from: Date, to: Date): Promise<ExpenseRow[]> {
  return db.expense.findMany({ where: { date: { gte: from, lt: to } }, orderBy: { date: "desc" } });
}

export async function expensesByCategory(from: Date, to: Date): Promise<{ category: string; pence: number }[]> {
  const rows = await db.expense.groupBy({ by: ["category"], where: { date: { gte: from, lt: to } }, _sum: { amountPence: true } });
  return rows.map((r) => ({ category: r.category, pence: r._sum.amountPence ?? 0 })).sort((a, b) => b.pence - a.pence);
}

/** CSV of every PAID/REFUNDED order in range, for the brief's "allow CSV export". No external deps: hand-rolled, quoted. */
export async function ordersCsv(from: Date, to: Date): Promise<string> {
  const rows = await db.order.findMany({ where: { status: { in: ["PAID", "REFUNDED"] }, paidAt: { gte: from, lt: to } }, orderBy: { paidAt: "asc" } });
  const named = await withBusinessNames(rows);
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["Date", "Business", "Product", "Source", "Status", "Amount (ex VAT)", "VAT", "Gross"].map(q).join(",");
  const lines = named.map((o) => {
    const ex = (o.amountPence - o.vatPence) / 100, vat = o.vatPence / 100, gross = o.amountPence / 100;
    return [o.date?.toISOString().slice(0, 10) ?? "", o.businessName, o.productKey, o.source, o.status, ex.toFixed(2), vat.toFixed(2), gross.toFixed(2)].map(q).join(",");
  });
  return [head, ...lines].join("\r\n") + "\r\n";
}

export async function expensesCsv(from: Date, to: Date): Promise<string> {
  const rows = await expensesInRange(from, to);
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["Date", "Category", "Description", "Amount", "Recurring"].map(q).join(",");
  const lines = rows.map((e) => [e.date.toISOString().slice(0, 10), e.category, e.description, (e.amountPence / 100).toFixed(2), e.recurring ? "yes" : "no"].map(q).join(","));
  return [head, ...lines].join("\r\n") + "\r\n";
}
