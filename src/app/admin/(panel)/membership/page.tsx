import Link from "next/link";
import { Breakdown, Card, Cell, Empty, Metric, MetricRow, Notice, PageHead, Progress, Row, Table, btn } from "@/components/Dash";
import { requirePermission } from "@/lib/auth";
import { gbp } from "@/lib/commerce";
import {
  claimFunnel, lifetimeStats, membershipMix, monthlyCohorts, segmentByCategory, segmentByLocation, topPayingBusinesses,
} from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership — Admin", robots: { index: false, follow: false } };

export default async function Membership() {
  await requirePermission("money.view");

  const [mix, byCategory, byLocation, funnel, cohorts, lifetime, top] = await Promise.all([
    membershipMix(),
    segmentByCategory(8),
    segmentByLocation(8),
    claimFunnel(),
    monthlyCohorts(6),
    lifetimeStats(),
    topPayingBusinesses(10),
  ]);

  const activePlans = mix.reduce((a, p) => a + p.active, 0);
  const pastDuePlans = mix.reduce((a, p) => a + p.pastDue, 0);
  const canceledPlans = mix.reduce((a, p) => a + p.canceled, 0);
  const totalMrr = mix.reduce((a, p) => a + p.mrrPence, 0);
  const claimToPayingPct = funnel.claimedOrVerifiedTotal ? Math.round((funnel.payingAmongClaimed / funnel.claimedOrVerifiedTotal) * 100) : 0;

  return (
    <>
      <PageHead
        title="Business & membership analytics"
        subtitle="Who is paying, which segments carry the business, and how long a membership tends to last — counted from real subscriptions and claims."
        actions={<Link href="/admin/growth" className={btn("ghost")}>Growth dashboard</Link>}
      />

      <MetricRow>
        <Metric label="Active plans" value={activePlans} icon="bolt" tone="accent" hint={`${gbp(totalMrr)}/mo`} href="/admin/money" />
        <Metric label="Past due" value={pastDuePlans} icon="shield" tone={pastDuePlans ? "warn" : "plain"} hint="Still counted as paying during the 7-day grace" href="/admin/money" />
        <Metric label="Cancelled, all time" value={canceledPlans} icon="users" />
        <Metric
          label="Claim → paying conversion" value={`${claimToPayingPct}%`} icon="check"
          hint={`${funnel.payingAmongClaimed} of ${funnel.claimedOrVerifiedTotal} claimed/verified businesses pay`}
          href="/admin/claims"
        />
      </MetricRow>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card title="Membership mix" description="Active, past-due and cancelled subscriptions by plan.">
            {mix.length === 0 ? (
              <Empty title="No plans configured" icon="card" />
            ) : (
              <Table head={["Plan", "Active", "Past due", "Cancelled", "MRR"]}>
                {mix.map((p) => (
                  <Row key={p.productKey}>
                    <Cell className="font-semibold">{p.productName}</Cell>
                    <Cell>{p.active}</Cell>
                    <Cell>{p.pastDue}</Cell>
                    <Cell>{p.canceled}</Cell>
                    <Cell>{gbp(p.mrrPence)}</Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Top segments by revenue" description="Paying businesses (active + past-due), grouped by category and by location.">
            <p className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-grey">By category</p>
            {byCategory.length === 0 ? <Empty title="No paying businesses yet" icon="chart" /> : (
              <Breakdown rows={byCategory.map((s, i) => ({ label: s.label, value: s.mrrPence, tone: i === 0 ? "yellow" : undefined }))} />
            )}
            <p className="mb-2 mt-6 text-[13px] font-extrabold uppercase tracking-wide text-grey">By location</p>
            {byLocation.length === 0 ? <Empty title="No paying businesses yet" icon="chart" /> : (
              <Breakdown rows={byLocation.map((s, i) => ({ label: s.label, value: s.mrrPence, tone: i === 0 ? "yellow" : undefined }))} />
            )}
          </Card>

          <Card title="Monthly cohort retention" description="Of the subscriptions that started in a given month, the share still active or past-due today.">
            <Table head={["Cohort", "Started", "Still retained", "Retained %"]}>
              {cohorts.map((c) => (
                <Row key={c.month}>
                  <Cell className="font-semibold">{c.month}</Cell>
                  <Cell>{c.started}</Cell>
                  <Cell>{c.stillRetained}</Cell>
                  <Cell>{c.started ? <Progress percent={c.retainedPct} label="" /> : <span className="text-grey">No signups</span>}</Cell>
                </Row>
              ))}
            </Table>
          </Card>

          <Card title="Top paying businesses" description="All-time revenue (ex VAT), richest first.">
            {top.length === 0 ? (
              <Empty title="No paid orders yet" icon="card" />
            ) : (
              <Table head={["Business", "Category", "Location", "Total paid", ""]}>
                {top.map((b) => (
                  <Row key={b.id}>
                    <Cell className="font-semibold">{b.name}</Cell>
                    <Cell className="text-grey">{b.category}</Cell>
                    <Cell className="text-grey">{b.location}</Cell>
                    <Cell>{gbp(b.totalPence)}</Cell>
                    <Cell><Link href={`/admin/businesses/${b.id}`} className="font-bold underline">Open</Link></Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="Claim funnel" description="Where businesses sit in the claim process.">
            <Breakdown
              rows={[
                { label: "Unclaimed", value: funnel.unclaimed },
                { label: "Pending", value: funnel.pending },
                { label: "Claimed", value: funnel.claimed, tone: "yellow" },
                { label: "Verified", value: funnel.verified, tone: "yellow" },
              ]}
            />
          </Card>

          <Card title="Observed membership lifetime" description="From subscriptions that have actually ended — not a projection.">
            {lifetime.avgLifetimeMonths === null ? (
              <Empty title="Not enough cancellations yet" icon="chart">
                Fewer than 3 subscriptions have ended, so an average would be unstable. {lifetime.canceledCount} recorded so far.
              </Empty>
            ) : (
              <dl className="grid gap-3 text-[15px]">
                <div><dt className="font-bold">Average lifetime</dt><dd>{lifetime.avgLifetimeMonths} months</dd></div>
                <div><dt className="font-bold">Average lifetime value</dt><dd>{gbp(lifetime.avgLtvPence ?? 0)}</dd></div>
                <div><dt className="font-bold">Based on</dt><dd>{lifetime.canceledCount} ended subscriptions</dd></div>
              </dl>
            )}
          </Card>

          <Card title="Not yet trackable" description="Disclosed rather than guessed at — see admin-dashboard-audit.md.">
            <ul className="space-y-3 text-[14px]">
              <li><span className="font-semibold">Cancellation reason</span><p className="text-grey">No reason is captured when a subscription is cancelled.</p></li>
              <li><span className="font-semibold">Projected LTV</span><p className="text-grey">Only the observed average of subscriptions that have already ended is shown — nothing is projected forward.</p></li>
            </ul>
          </Card>

          <Notice tone="info" title="Note">
            Segments and cohorts count <strong>ACTIVE</strong> and <strong>PAST_DUE</strong> subscriptions as paying, matching the rest of the admin panel.
          </Notice>

          <Card title="Drill down">
            <ul className="space-y-2 text-[14px]">
              <li><Link href="/admin/growth" className="font-bold underline">Growth dashboard</Link></li>
              <li><Link href="/admin/finance" className="font-bold underline">Finance</Link></li>
              <li><Link href="/admin/money" className="font-bold underline">Money</Link></li>
              <li><Link href="/admin/businesses" className="font-bold underline">Businesses</Link></li>
              <li><Link href="/admin/claims" className="font-bold underline">Business claims</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
