import { db } from "./db";
import { recordedExpenses, revenueInRange } from "./growth";
import { expensesByCategory } from "./finance";

/**
 * Metrics for the Phase 7 costs & cash-flow module (`/admin/costs`).
 *
 * No schema change: the starting cash balance reuses the generic `Setting` table (same pattern as the
 * revenue target in growth.ts), editable from /admin/settings. Builds entirely on revenueInRange() and
 * recordedExpenses() from growth.ts, so revenue/expense figures never disagree with Growth or Finance.
 *
 * Deliberate limitation, disclosed on the page: the platform has no bank feed and no payment-date field on
 * `Sponsorship`, so sponsorship revenue is counted at the moment it is marked invoiced (revenueInRange's
 * existing definition), not when the money actually lands. The cash estimate below is only as accurate as
 * that assumption and the completeness of the Expense ledger (writer payments + manually entered expenses
 * only — see finance.ts).
 */

export const CASH_BALANCE_PENCE_KEY = "cash.starting_balance_pence";
export const CASH_BALANCE_DATE_KEY = "cash.starting_balance_date";

export type CashBaseline = { pence: number; asOf: Date };

/** The admin-entered "cash in the bank as of this date" starting point. Null until one has been set. */
export async function cashBaseline(): Promise<CashBaseline | null> {
  const [penceRow, dateRow] = await Promise.all([
    db.setting.findUnique({ where: { key: CASH_BALANCE_PENCE_KEY } }),
    db.setting.findUnique({ where: { key: CASH_BALANCE_DATE_KEY } }),
  ]);
  const pence = penceRow ? Number(penceRow.value) : NaN;
  const asOf = dateRow && /^\d{4}-\d{2}-\d{2}$/.test(dateRow.value) ? new Date(`${dateRow.value}T00:00:00Z`) : null;
  if (!Number.isFinite(pence) || !asOf) return null;
  return { pence, asOf };
}

export type CashEstimate = { pence: number; asOf: Date; baselineAsOf: Date; baselinePence: number };
/** Baseline + recorded revenue (ex VAT) − recorded expenses since the baseline date. Null if no baseline is set. */
export async function currentCashEstimate(now = new Date()): Promise<CashEstimate | null> {
  const baseline = await cashBaseline();
  if (!baseline) return null;
  const [revenue, expenses] = await Promise.all([revenueInRange(baseline.asOf, now), recordedExpenses(baseline.asOf, now)]);
  return { pence: baseline.pence + revenue.total - expenses.pence, asOf: now, baselineAsOf: baseline.asOf, baselinePence: baseline.pence };
}

export type MonthFlow = { month: string; revenuePence: number; expensePence: number; netPence: number; complete: boolean };
/** Per-calendar-month revenue/expense/net, oldest first. The current (partial) month is included but flagged. */
export async function monthlyNetCashFlow(monthsBack = 6, now = new Date()): Promise<MonthFlow[]> {
  const out: MonthFlow[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = i === 0 ? now : new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const [revenue, expenses] = await Promise.all([revenueInRange(from, to), recordedExpenses(from, to)]);
    out.push({ month: from.toLocaleDateString("en-GB", { month: "short", year: "numeric" }), revenuePence: revenue.total, expensePence: expenses.pence, netPence: revenue.total - expenses.pence, complete: i !== 0 });
  }
  return out;
}

export type BurnRate = { avgMonthlyNetPence: number; monthsSampled: number; burning: boolean; runwayMonths: number | null };
/** Average net cash flow over trailing complete months, and runway (months of cash left) if burning and a baseline exists. */
export async function burnRateAndRunway(monthsBack = 3, now = new Date()): Promise<BurnRate> {
  const flows = (await monthlyNetCashFlow(monthsBack + 1, now)).filter((f) => f.complete).slice(-monthsBack);
  const avg = flows.length ? flows.reduce((a, f) => a + f.netPence, 0) / flows.length : 0;
  const burning = avg < 0;
  const cash = burning ? await currentCashEstimate(now) : null;
  const runwayMonths = burning && cash && avg !== 0 ? cash.pence / Math.abs(avg) : null;
  return { avgMonthlyNetPence: avg, monthsSampled: flows.length, burning, runwayMonths };
}

export type RecurringRunRate = { pence: number; count: number; month: string };
/** Sum of expenses flagged `recurring` in the most recently completed calendar month — a run-rate estimate, not a contract-level forecast (no contract end dates are recorded anywhere). */
export async function recurringCostRunRate(now = new Date()): Promise<RecurringRunRate> {
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await db.expense.findMany({ where: { recurring: true, date: { gte: from, lt: to } }, select: { amountPence: true } });
  return { pence: rows.reduce((a, r) => a + r.amountPence, 0), count: rows.length, month: from.toLocaleDateString("en-GB", { month: "short", year: "numeric" }) };
}

export { expensesByCategory };
