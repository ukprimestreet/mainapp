import Link from "next/link";
import { Card, Cell, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn } from "@/components/Dash";
import { requirePermission } from "@/lib/auth";
import { gbp } from "@/lib/commerce";
import { burnRateAndRunway, currentCashEstimate, expensesByCategory, monthlyNetCashFlow, recurringCostRunRate } from "@/lib/costs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costs & cash flow — Admin", robots: { index: false, follow: false } };

const fmtMonths = (m: number | null) => m === null ? "—" : `${m.toFixed(1)} mo`;

export default async function Costs() {
  await requirePermission("money.view");
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

  const [cash, flows, burn, recurring, byCategory] = await Promise.all([
    currentCashEstimate(now),
    monthlyNetCashFlow(6, now),
    burnRateAndRunway(3, now),
    recurringCostRunRate(now),
    expensesByCategory(ninetyDaysAgo, now),
  ]);

  return (
    <>
      <PageHead
        title="Costs & cash flow"
        subtitle="Monthly burn, runway and recurring cost run-rate — built from recorded revenue and the expense ledger, not a bank feed."
        actions={<Link href="/admin/finance" className={btn("ghost")}>Finance detail</Link>}
      />

      <MetricRow>
        <Metric
          label="Estimated cash balance" value={cash ? gbp(cash.pence) : "Not set"} icon="card" tone="accent"
          hint={cash ? `As of today, from a baseline of ${gbp(cash.baselinePence)} on ${cash.baselineAsOf.toLocaleDateString("en-GB")}` : "Set a baseline in Settings to enable this"}
          href="/admin/settings"
        />
        <Metric label="Avg monthly net cash flow" value={gbp(burn.avgMonthlyNetPence)} icon="bolt" tone={burn.burning ? "warn" : "plain"} hint={`Over ${burn.monthsSampled} complete month${burn.monthsSampled === 1 ? "" : "s"}`} />
        <Metric label="Runway" value={fmtMonths(burn.runwayMonths)} icon="shield" tone={burn.runwayMonths !== null ? "warn" : "plain"} hint={burn.burning ? "Months of cash left at the current burn rate" : "Not burning cash — revenue has covered recorded expenses"} />
        <Metric label="Recurring run-rate" value={gbp(recurring.pence)} icon="chart" hint={`${recurring.count} recurring expense${recurring.count === 1 ? "" : "s"} recorded in ${recurring.month}`} href="/admin/finance" />
      </MetricRow>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card title="Monthly net cash flow" description="Revenue ex VAT minus recorded expenses, per calendar month. The current month is partial.">
            <Table head={["Month", "Revenue", "Expenses", "Net"]}>
              {flows.map((f) => (
                <Row key={f.month}>
                  <Cell className="font-semibold">{f.month}{!f.complete ? " (so far)" : ""}</Cell>
                  <Cell>{gbp(f.revenuePence)}</Cell>
                  <Cell>{gbp(f.expensePence)}</Cell>
                  <Cell className={f.netPence < 0 ? "font-bold text-red-700" : "font-bold"}>{gbp(f.netPence)}</Cell>
                </Row>
              ))}
            </Table>
          </Card>

          <Card title="Largest cost categories" description="Recorded expenses in the last 90 days, richest first.">
            {byCategory.length === 0 ? (
              <Empty title="No expenses recorded" icon="card" />
            ) : (
              <Table head={["Category", "Amount"]}>
                {byCategory.map((c) => (
                  <Row key={c.category}>
                    <Cell className="font-semibold">{c.category}</Cell>
                    <Cell>{gbp(c.pence)}</Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-7">
          <Card title="Not yet trackable" description="Disclosed rather than estimated.">
            <p className="text-sm text-grey">
              There is no bank feed, so nothing here is reconciled against an actual account balance — it is a running calculation
              from recorded revenue and recorded expenses only. Sponsorship revenue is counted when marked invoiced, not when it is
              actually paid (no payment-date field exists on a sponsorship), so the cash estimate assumes invoices are settled
              promptly. The expense ledger only contains writer payments and manually entered expenses — any other real cost is
              simply not in this number.
            </p>
          </Card>

          <Notice tone={cash ? "info" : "warn"}>
            {cash
              ? "Cash balance is an estimate from a manually entered baseline, not a live bank balance."
              : "No cash balance baseline is set. Add one in Settings (\"Cash balance baseline\") to see an estimated balance and runway here."}
          </Notice>

          <Card title="Drill down" description="Related admin pages.">
            <ul className="space-y-2 text-sm font-bold underline">
              <li><Link href="/admin/finance">Finance detail</Link></li>
              <li><Link href="/admin/growth">Growth dashboard</Link></li>
              <li><Link href="/admin/settings">Settings</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
