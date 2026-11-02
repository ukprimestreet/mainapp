import Link from "next/link";
import { Breakdown, Card, Cell, Empty, Metric, MetricRow, Notice, PageHead, Progress, Row, Table, btn } from "@/components/Dash";
import { requirePermission } from "@/lib/auth";
import { gbp } from "@/lib/commerce";
import {
  basicAlerts, deltaPct, leadsSubmitted, monthlyTargetPence, mrrNow, netMembershipGrowth,
  newPayingBusinesses, payingBusinessCount, recordedExpenses, resolveRange, revenueInRange, type RangeKey,
} from "@/lib/growth";

export const dynamic = "force-dynamic";

type SP = { searchParams: Promise<{ range?: string; from?: string; to?: string }> };

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_year", label: "This year" },
];

const d = (date: Date) => date.toISOString().slice(0, 10);

export default async function Growth({ searchParams }: SP) {
  await requirePermission("money.view");
  const sp = await searchParams;
  const range = resolveRange(sp);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    revenue, prevRevenue, mrr, payingNow, payingBefore, newPaying, membership, leads, prevLeads, expenses, target, monthRevenue, alerts,
  ] = await Promise.all([
    revenueInRange(range.from, range.to),
    revenueInRange(range.prevFrom, range.prevTo),
    mrrNow(),
    payingBusinessCount(range.to),
    payingBusinessCount(range.prevTo),
    newPayingBusinesses(range.from, range.to),
    netMembershipGrowth(range.from, range.to),
    leadsSubmitted(range.from, range.to),
    leadsSubmitted(range.prevFrom, range.prevTo),
    recordedExpenses(range.from, range.to),
    monthlyTargetPence(),
    revenueInRange(monthStart, now),
    basicAlerts(),
  ]);

  const estimatedProfit = revenue.total - expenses.pence;
  const targetPct = target ? (monthRevenue.total / target) * 100 : null;

  const rangeHref = (key: RangeKey) => `/admin/growth?range=${key}`;
  const pctHint = (current: number, previous: number) => {
    const p = deltaPct(current, previous, range.comparable);
    return p === null ? "No comparable prior period" : `${p >= 0 ? "+" : ""}${p}% vs previous period`;
  };

  return (
    <>
      <PageHead
        title="Growth dashboard"
        subtitle="Revenue, growth and the things that need a decision — counted from real orders, subscriptions and leads. Nothing here is estimated unless it's labelled as an estimate."
        actions={<Link href="/admin/finance" className={btn("ghost")}>Finance detail</Link>}
      />

      <Card title="Period" pad={false}>
        <div className="flex flex-wrap items-center gap-2 p-5">
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={rangeHref(p.key)}
              aria-current={range.key === p.key ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-bold transition ${
                range.key === p.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"
              }`}
            >
              {p.label}
            </Link>
          ))}
          <form className="flex flex-wrap items-center gap-2" role="search" aria-label="Custom date range">
            <input type="hidden" name="range" value="custom" />
            <label className="sr-only" htmlFor="from">From</label>
            <input id="from" type="date" name="from" defaultValue={range.key === "custom" ? d(range.from) : undefined} className="min-h-9 rounded-full border border-line px-3 text-[13px]" />
            <span className="text-grey">–</span>
            <label className="sr-only" htmlFor="to">To</label>
            <input id="to" type="date" name="to" defaultValue={range.key === "custom" ? d(new Date(range.to.getTime() - 1)) : undefined} className="min-h-9 rounded-full border border-line px-3 text-[13px]" />
            <button className="inline-flex min-h-9 items-center rounded-full border border-ink bg-white px-3.5 text-[13px] font-bold hover:bg-yellow">Custom</button>
          </form>
        </div>
      </Card>

      <MetricRow>
        <Metric label={`Revenue — ${range.label}`} value={gbp(revenue.total)} icon="card" tone="accent" hint={pctHint(revenue.total, prevRevenue.total)} href="/admin/money" />
        <Metric label="Monthly recurring revenue" value={gbp(mrr.pence)} unit="/mo" icon="chart" hint={`${mrr.activePlans} active plan${mrr.activePlans === 1 ? "" : "s"}`} href="/admin/money" />
        <Metric label="Paying businesses" value={payingNow} icon="shop" hint={range.comparable ? pctHint(payingNow, payingBefore) : "As of now"} href="/admin/businesses" />
        <Metric label="New paying businesses" value={newPaying} icon="users" hint={`in ${range.label.toLowerCase()}`} href="/admin/businesses" />
      </MetricRow>

      <MetricRow>
        <Metric label="Net membership growth" value={membership.net > 0 ? `+${membership.net}` : membership.net} icon="bolt" hint={`${membership.started} started · ${membership.cancelled} cancelled`} href="/admin/money" />
        <Metric label="Leads submitted" value={leads} icon="inbox" hint={pctHint(leads, prevLeads)} href="/admin/businesses" />
        <Metric label="Recorded operating expenses" value={gbp(expenses.pence)} icon="card" tone={expenses.pence ? "plain" : "plain"} hint={expenses.note} href="/admin/payments" />
        <Metric
          label="Estimated operating profit" value={gbp(estimatedProfit)} icon="chart" tone={estimatedProfit < 0 ? "warn" : "dark"}
          hint="Revenue minus recorded expenses only — not a statutory figure"
        />
      </MetricRow>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card
            title="Progress towards the monthly revenue target"
            description={target ? `Target set in Settings: ${gbp(target)}/month.` : "No target has been set."}
          >
            {target ? (
              <Progress percent={targetPct ?? 0} label={`${gbp(monthRevenue.total)} this month`} />
            ) : (
              <Empty title="No monthly revenue target set" icon="chart" action={<Link href="/admin/settings" className={btn()}>Set a target</Link>}>
                Set <code>revenue.monthly_target_pence</code> in Settings to track progress here.
              </Empty>
            )}
          </Card>

          <Card title="Revenue by source" description={`${range.label}. Ex VAT — VAT is off by default and, when switched on in Settings, is tracked separately below, never as revenue.`}>
            <Breakdown
              rows={[
                { label: "Memberships", value: revenue.memberships, tone: "yellow" },
                { label: "Featured listings", value: revenue.featured },
                { label: "Sponsorships", value: revenue.sponsorships },
                { label: "Lead credits", value: revenue.leadCredits },
              ]}
            />
            {revenue.vatCollected > 0 && (
              <p className="mt-3 text-[13px] text-grey">VAT collected (not revenue): <strong className="text-ink">{gbp(revenue.vatCollected)}</strong></p>
            )}
            <ul className="mt-5 space-y-2 border-t border-line pt-4 text-[13px] text-grey">
              {revenue.untracked.map((u) => (
                <li key={u.label}><strong className="text-ink">{u.label}:</strong> not tracked — {u.note}</li>
              ))}
            </ul>
          </Card>

          <Card title="Alerts" description="A lightweight set of signals already available. The configurable alert system (thresholds, categories, demand coverage) is a later phase.">
            {alerts.length === 0 ? (
              <Empty title="Nothing needs attention" icon="check" />
            ) : (
              <Table head={["", "Detail", ""]}>
                {alerts.map((a, i) => (
                  <Row key={i}>
                    <Cell className="font-semibold">{a.title}</Cell>
                    <Cell className="text-grey">{a.detail}</Cell>
                    <Cell><Link href={a.href} className="font-bold underline">Open</Link></Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="Not yet trackable" description="Disclosed rather than guessed at — see admin-dashboard-audit.md.">
            <ul className="space-y-3 text-[14px]">
              <li><span className="font-semibold">Lead response and delivery</span><p className="text-grey">Tracked now — see <Link href="/admin/leads-analytics" className="underline">Lead analytics</Link>. Production has no live job requests yet (geography import not authorised), so the figures there are dev-only.</p></li>
              <li><span className="font-semibold">Operating cash balance</span><p className="text-grey">Not entered anywhere yet (Phase 7).</p></li>
            </ul>
          </Card>

          {!target && (
            <Notice tone="info" title="Target not set">
              Add a <strong>revenue.monthly_target_pence</strong> setting to see progress towards the monthly revenue target.
            </Notice>
          )}

          <Card title="Drill down">
            <ul className="space-y-2 text-[14px]">
              <li><Link href="/admin/finance" className="font-bold underline">Finance detail</Link></li>
              <li><Link href="/admin/membership" className="font-bold underline">Membership analytics</Link></li>
              <li><Link href="/admin/sales" className="font-bold underline">Sales CRM</Link></li>
              <li><Link href="/admin/costs" className="font-bold underline">Costs & cash flow</Link></li>
              <li><Link href="/admin/leads-analytics" className="font-bold underline">Lead analytics</Link></li>
              <li><Link href="/admin/businesses" className="font-bold underline">Businesses</Link></li>
              <li><Link href="/admin/commerce" className="font-bold underline">Commerce</Link></li>
              <li><Link href="/admin/payments" className="font-bold underline">Writer payments</Link></li>
              <li><Link href="/admin/claims" className="font-bold underline">Business claims</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
