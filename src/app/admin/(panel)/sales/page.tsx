import Link from "next/link";
import { Card, Cell, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn } from "@/components/Dash";
import { requirePermission } from "@/lib/auth";
import { byInterest, byOwner, conversionStats, overdueFollowUps, pipelineByStage, timeToClose } from "@/lib/sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales CRM — Admin", robots: { index: false, follow: false } };

const fmtDays = (d: number | null) => d === null ? "—" : `${d.toFixed(1)}d`;
const fmtPct = (p: number | null) => p === null ? "—" : `${Math.round(p)}%`;

export default async function Sales() {
  await requirePermission("money.view");

  const [stages, conversion, close, interests, owners, overdue] = await Promise.all([
    pipelineByStage(),
    conversionStats(),
    timeToClose(),
    byInterest(),
    byOwner(),
    overdueFollowUps(),
  ]);

  return (
    <>
      <PageHead
        title="Sales CRM"
        subtitle="Pipeline stage, win rate, time to close and follow-up tracking for commerce/advertising/partnership enquiries."
        actions={<Link href="/admin/commerce/enquiries" className={btn("ghost")}>All enquiries</Link>}
      />

      <MetricRow>
        <Metric label="Open deals" value={conversion.open} icon="inbox" tone="accent" href="/admin/commerce/enquiries" />
        <Metric label="Won, all time" value={conversion.won} icon="check" />
        <Metric label="Win rate (of closed)" value={fmtPct(conversion.winRatePct)} icon="bolt" hint={`${conversion.won} won, ${conversion.lost} lost`} />
        <Metric label="Overdue follow-ups" value={overdue.length} icon="shield" tone={overdue.length ? "warn" : "plain"} />
      </MetricRow>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card title="Pipeline by stage" description="Every commerce/advertising/partnership enquiry, grouped by status.">
            <Table head={["Stage", "Count"]}>
              {stages.map((s) => (
                <Row key={s.status}>
                  <Cell className="font-semibold">{s.status}</Cell>
                  <Cell>{s.count}</Cell>
                </Row>
              ))}
            </Table>
          </Card>

          <Card title="By interest type" description="Volume and win rate per enquiry type (premium/featured/advertising/sponsorship/other).">
            {interests.length === 0 ? (
              <Empty title="No enquiries yet" icon="inbox" />
            ) : (
              <Table head={["Interest", "Total", "Won", "Lost", "Win rate"]}>
                {interests.map((r) => (
                  <Row key={r.interest}>
                    <Cell className="font-semibold">{r.interest}</Cell>
                    <Cell>{r.total}</Cell>
                    <Cell>{r.won}</Cell>
                    <Cell>{r.lost}</Cell>
                    <Cell>{fmtPct(r.winRatePct)}</Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Card title="By sales owner" description="Open/won/lost counts and overdue follow-ups per assigned admin.">
            <Table head={["Owner", "Open", "Won", "Lost", "Overdue follow-ups"]}>
              {owners.map((o) => (
                <Row key={o.ownerId ?? "unassigned"}>
                  <Cell className="font-semibold">{o.ownerName}</Cell>
                  <Cell>{o.open}</Cell>
                  <Cell>{o.won}</Cell>
                  <Cell>{o.lost}</Cell>
                  <Cell>{o.overdueFollowUps}</Cell>
                </Row>
              ))}
            </Table>
          </Card>
        </div>

        <div className="min-w-0 space-y-7">
          <Card title="Time to close" description="Average days from enquiry to a WON or LOST decision.">
            <Table head={["", "Average days"]}>
              <Row><Cell className="font-semibold">To win</Cell><Cell>{fmtDays(close.avgDaysWon)}</Cell></Row>
              <Row><Cell className="font-semibold">To lose</Cell><Cell>{fmtDays(close.avgDaysLost)}</Cell></Row>
            </Table>
          </Card>

          <Card title="Overdue follow-ups" description="Open deals whose follow-up date has passed.">
            {overdue.length === 0 ? (
              <Empty title="Nothing overdue" icon="check" />
            ) : (
              <ul className="space-y-3 text-sm">
                {overdue.slice(0, 10).map((e) => (
                  <li key={e.id} className="rounded-xl border border-line p-3">
                    <p className="font-bold">{e.name}{e.company ? ` · ${e.company}` : ""}</p>
                    <p className="text-grey">{e.interest} · {e.status} · owner: {e.ownerName} · due {e.followUpAt.toLocaleDateString("en-GB")}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Not yet trackable" description="Disclosed rather than estimated.">
            <p className="text-sm text-grey">
              Customer acquisition cost cannot be computed — no ad-spend or marketing-cost record exists anywhere in the platform.
              Showing a CAC figure here would mean dividing by a cost that doesn&apos;t exist, so it is left out rather than guessed.
            </p>
          </Card>

          <Notice>
            Win rate is calculated among <strong>closed</strong> deals only (won ÷ (won + lost)); open deals are neither a win nor a loss yet.
          </Notice>

          <Card title="Drill down" description="Related admin pages.">
            <ul className="space-y-2 text-sm font-bold underline">
              <li><Link href="/admin/commerce/enquiries">All enquiries</Link></li>
              <li><Link href="/admin/commerce">Commerce overview</Link></li>
              <li><Link href="/admin/growth">Growth dashboard</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
