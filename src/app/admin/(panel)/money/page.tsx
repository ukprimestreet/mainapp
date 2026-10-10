import Link from "next/link";
import { BarChart, Breakdown, Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { gbp, monthlyPence } from "@/lib/commerce";
import { siteRevenue } from "@/lib/analytics";

export const dynamic = "force-dynamic";
const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

export default async function Money() {
  const now = new Date();
  const [revenue, products, live, pastDue, cancelled, paidOrders, failedOrders, pendingOrders, recent, campaigns, sponsorships, writerDue] = await Promise.all([
    siteRevenue(90),
    db.product.findMany(),
    db.subscription.findMany({ where: { status: "ACTIVE" }, include: { business: true } }),
    db.subscription.findMany({ where: { status: "PAST_DUE" }, include: { business: true } }),
    db.subscription.count({ where: { status: "CANCELED" } }),
    db.order.aggregate({ where: { status: "PAID" }, _sum: { amountPence: true }, _count: true }),
    db.order.count({ where: { status: "FAILED" } }),
    db.order.count({ where: { status: "PENDING" } }),
    db.order.findMany({ where: { status: { in: ["PAID", "FAILED"] } }, orderBy: { createdAt: "desc" }, take: 12, include: { business: true } }),
    db.campaign.findMany({ where: { status: "ACTIVE", endsAt: { gte: now } } }),
    db.sponsorship.findMany({ where: { status: { in: ["ACTIVE", "DONE"] } } }),
    db.writerPayment.aggregate({ where: { status: { in: ["DUE", "SUBMITTED", "APPROVED"] } }, _sum: { amountPence: true } }),
  ]);

  const price = new Map(products.map((p) => [p.key, p]));
  const mrr = live.reduce((a, s) => a + (price.get(s.productKey) ? monthlyPence(price.get(s.productKey)!) : 0), 0);
  const atRisk = pastDue.reduce((a, s) => a + (price.get(s.productKey) ? monthlyPence(price.get(s.productKey)!) : 0), 0);
  const totalEver = live.length + cancelled;
  const churn = pct(cancelled, totalEver);
  const sponsorIncome = sponsorships.reduce((a, s) => a + s.pricePence, 0);
  const owed = writerDue._sum.amountPence ?? 0;

  const byProduct = products.map((p) => ({
    label: p.name,
    value: live.filter((s) => s.productKey === p.key).length,
  })).filter((r) => r.value > 0);

  return (
    <>
      <PageHead title="Money" subtitle="What is coming in, what is at risk, and what is owed. Every figure is counted from real orders and subscriptions." />

      {mrr === 0 && (
        <Notice tone="info" title="Nothing is being charged yet">
          Products ship inactive at £0. Set prices and Stripe Price IDs in <Link href="/admin/commerce" className="font-bold underline">Commerce</Link> before any of this moves.
        </Notice>
      )}

      <MetricRow>
        <Metric label="Recurring revenue" value={gbp(mrr)} unit="/mo" icon="card" tone="accent" hint={`${live.length} active ${live.length === 1 ? "plan" : "plans"}`} />
        <Metric label="At risk" value={gbp(atRisk)} unit="/mo" icon="shield" tone={atRisk ? "warn" : "plain"} hint={`${pastDue.length} payment${pastDue.length === 1 ? "" : "s"} failing`} />
        <Metric label="Paid, all time" value={gbp(paidOrders._sum.amountPence ?? 0)} icon="chart" hint={`${paidOrders._count} orders`} />
        <Metric label="Owed to writers" value={gbp(owed)} icon="users" tone={owed ? "dark" : "plain"} hint="Approved and unpaid" />
      </MetricRow>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card title="Money in" description="Paid orders over the last 90 days.">
            {revenue.total === 0
              ? <Empty title="No payments yet" icon="card">Once Stripe is live and a product is sold, it appears here.</Empty>
              : <BarChart series={revenue} label="Paid orders" />}
          </Card>

          <Card title="Recent orders">
            {recent.length === 0 ? (
              <Empty title="No orders yet" icon="card" />
            ) : (
              <Table head={["Business", "Product", "Amount", "Status", "When"]}>
                {recent.map((o) => (
                  <Row key={o.id}>
                    <Cell className="font-semibold [overflow-wrap:anywhere]">{o.business.name}</Cell>
                    <Cell className="text-grey">{price.get(o.productKey)?.name ?? o.productKey}</Cell>
                    <Cell className="font-display font-extrabold tabular-nums">{gbp(o.amountPence)}</Cell>
                    <Cell><Chip tone={o.status === "PAID" ? "live" : "bad"}>{o.status.toLowerCase()}</Chip></Cell>
                    <Cell className="whitespace-nowrap text-grey">{fmtDate(o.createdAt)}</Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          {pastDue.length > 0 && (
            <Card title="Failing payments" description="Chase these first: recovering a customer costs far less than finding one.">
              <Table head={["Business", "Plan", "Worth", ""]}>
                {pastDue.map((s) => (
                  <Row key={s.id}>
                    <Cell className="font-semibold">{s.business.name}</Cell>
                    <Cell className="text-grey">{price.get(s.productKey)?.name ?? s.productKey}</Cell>
                    <Cell className="font-display font-extrabold tabular-nums">{gbp(price.get(s.productKey) ? monthlyPence(price.get(s.productKey)!) : 0)}/mo</Cell>
                    <Cell><Link href="/admin/commerce/subscriptions" className="font-bold underline">Open</Link></Cell>
                  </Row>
                ))}
              </Table>
            </Card>
          )}
        </div>

        <div className="min-w-0">
          <Card title="Health">
            <ul className="space-y-3 text-[14px]">
              <li className="flex justify-between"><span className="text-grey">Churn, all time</span><strong className="tabular-nums">{churn}%</strong></li>
              <li className="flex justify-between"><span className="text-grey">Cancelled plans</span><strong className="tabular-nums">{cancelled}</strong></li>
              <li className="flex justify-between"><span className="text-grey">Failed checkouts</span><strong className="tabular-nums">{failedOrders}</strong></li>
              <li className="flex justify-between"><span className="text-grey">Abandoned baskets</span><strong className="tabular-nums">{pendingOrders}</strong></li>
            </ul>
            {pendingOrders > 0 && (
              <p className="mt-4 text-[13px] text-grey">
                {pendingOrders} unfinished {pendingOrders === 1 ? "checkout" : "checkouts"}.{" "}
                <Link href="/admin/automations" className="font-bold underline">The recovery automation</Link> handles these.
              </p>
            )}
          </Card>

          <Card title="Where revenue comes from">
            <Breakdown rows={[
              { label: "Subscriptions", value: mrr, tone: "yellow" },
              { label: "One-off orders", value: paidOrders._sum.amountPence ?? 0 },
              { label: "Sponsorships", value: sponsorIncome },
            ]} />
          </Card>

          {byProduct.length > 0 && (
            <Card title="Active plans by product">
              <Breakdown rows={byProduct} />
            </Card>
          )}

          <Card title="Running campaigns">
            <Metric label="Live featured and ad campaigns" value={campaigns.length} />
            <Link href="/admin/commerce/campaigns" className="mt-3 inline-block font-bold underline">Manage campaigns</Link>
          </Card>
        </div>
      </div>
    </>
  );
}
