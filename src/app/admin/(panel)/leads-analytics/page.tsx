import Link from "next/link";
import { Breakdown, Card, Cell, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn } from "@/components/Dash";
import { requirePermission } from "@/lib/auth";
import { gbp } from "@/lib/commerce";
import { deltaPct, resolveRange, type RangeKey } from "@/lib/growth";
import { creditsSummary, demandWithoutSupply, jobFunnel, matchDecisionBreakdown, responseStats } from "@/lib/lead-analytics";
import { LOW_BALANCE_THRESHOLD } from "@/lib/credits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead generation — Admin", robots: { index: false, follow: false } };

type SP = { searchParams: Promise<{ range?: string; from?: string; to?: string }> };

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_year", label: "This year" },
];

/**
 * Phase 4 of `admin-dashboard-audit.md`: lead-generation analytics.
 *
 * Originally deferred because the lead-credit system was "designed, not built". It has since been built —
 * `JobRequest`, `LeadAssignment`, `MatchDecision`, `CreditAccount`/`CreditTransaction` all exist and are
 * tested (`scripts/test-leads.ts`, `test-matching.ts`, `test-lead-response.ts`, `test-credit-purchase.ts`).
 * This page reads that data; the operational queue at `/admin/leads` is unchanged and still the place to
 * work a lead by hand.
 */
export default async function LeadAnalytics({ searchParams }: SP) {
  await requirePermission("leads.view");
  const sp = await searchParams;
  const range = resolveRange(sp);

  const [funnel, prevFunnel, responses, credits, decisions, gaps] = await Promise.all([
    jobFunnel(range.from, range.to),
    jobFunnel(range.prevFrom, range.prevTo),
    responseStats(range.from, range.to),
    creditsSummary(range.from, range.to),
    matchDecisionBreakdown(range.from, range.to),
    demandWithoutSupply(10),
  ]);

  const rangeHref = (key: RangeKey) => `/admin/leads-analytics?range=${key}`;
  const pctHint = (current: number, previous: number) => {
    const p = deltaPct(current, previous, range.comparable);
    return p === null ? "No comparable prior period" : `${p >= 0 ? "+" : ""}${p}% vs previous period`;
  };
  const responseRatePct = responses.assignmentsCreated ? Math.round((responses.responded / responses.assignmentsCreated) * 100) : null;
  const declineRatePct = responses.responded ? Math.round((responses.declined / responses.responded) * 100) : null;

  return (
    <>
      <PageHead
        title="Lead generation"
        subtitle="Job requests, matching and credits — counted from the live matching system, not estimated."
        actions={<Link href="/admin/leads" className={btn("ghost")}>Work the queue</Link>}
      />

      <Notice tone="warn" title="This is dev-schema data, not production demand">
        Production&apos;s <code>Place</code> and <code>JobRequest</code> tables are empty — the geography import has not
        been authorised yet (see <code>BATCH_LOG.md</code>). Every figure below reflects the system working correctly
        in development, not real customer demand. Treat this as &quot;does the pipeline behave&quot;, not &quot;how much demand is there&quot;.
      </Notice>

      <Card title="Period" pad={false}>
        <div className="flex flex-wrap items-center gap-2 p-5">
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={rangeHref(p.key)}
              className={btn(range.key === p.key ? "primary" : "ghost")}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </Card>

      <MetricRow>
        <Metric label={`Job requests — ${range.label}`} value={funnel.submitted} icon="inbox" tone="accent" hint={pctHint(funnel.submitted, prevFunnel.submitted)} href="/admin/leads" />
        <Metric label="Had supply at all" value={funnel.withSupply} icon="shield" hint={funnel.submitted ? `${Math.round((funnel.withSupply / funnel.submitted) * 100)}% of submitted` : "No requests in period"} />
        <Metric label="Actually assigned" value={funnel.assigned} icon="bolt" hint={funnel.submitted ? `${Math.round((funnel.assigned / funnel.submitted) * 100)}% of submitted` : "No requests in period"} />
        <Metric label="Closed" value={funnel.closed} icon="check" />
      </MetricRow>

      <div className="grid gap-7 lg:grid-cols-2">
        <Card title="Business response" description={`Paid assignments created ${range.label.toLowerCase()}. Sponsored (free) placements are excluded — nothing was charged for them.`}>
          {responses.assignmentsCreated === 0 ? (
            <Empty title="No paid assignments in this period" icon="inbox" />
          ) : (
            <>
              <MetricRow cols={2}>
                <Metric label="Responded" value={`${responseRatePct}%`} tone={responseRatePct !== null && responseRatePct < 50 ? "warn" : "plain"} hint={`${responses.responded} of ${responses.assignmentsCreated}`} />
                <Metric label="Declined (of responded)" value={declineRatePct === null ? "—" : `${declineRatePct}%`} tone={declineRatePct !== null && declineRatePct > 30 ? "warn" : "plain"} hint={`${responses.declined} declined, ${responses.called} called`} />
              </MetricRow>
              <Table head={["", "Count"]}>
                <Row><Cell>Delivered (dashboard opened)</Cell><Cell className="tabular-nums">{responses.delivered}</Cell></Row>
                <Row><Cell>Said &quot;called&quot;</Cell><Cell className="tabular-nums">{responses.called}</Cell></Row>
                <Row><Cell>Said &quot;declined&quot;</Cell><Cell className="tabular-nums">{responses.declined}</Cell></Row>
                <Row><Cell>No response yet</Cell><Cell className="tabular-nums">{responses.noResponseYet}</Cell></Row>
              </Table>
            </>
          )}
        </Card>

        <Card title="Credits" description={`${range.label}. £1 per credit, ex VAT (see Settings for the VAT toggle).`}>
          <MetricRow cols={2}>
            <Metric label="Purchased" value={credits.purchasedCredits} hint={gbp(credits.purchaseRevenuePence)} />
            <Metric label="Spent" value={credits.spentCredits} />
          </MetricRow>
          <Table head={["", "Count"]}>
            <Row><Cell>Welcome grants given</Cell><Cell className="tabular-nums">{credits.welcomeGrantsGiven} ({credits.welcomeCreditsGiven} credits)</Cell></Row>
            <Row><Cell>Reversed (declined/failed assignments)</Cell><Cell className="tabular-nums">{credits.reversedCredits}</Cell></Row>
            <Row><Cell>Businesses at or below {LOW_BALANCE_THRESHOLD} credits now</Cell><Cell className="tabular-nums">{credits.lowOrZeroBalanceBusinesses}</Cell></Row>
          </Table>
        </Card>
      </div>

      <Card title="Matching decisions" description={`Every inclusion and exclusion recorded in ${range.label.toLowerCase()}, grouped by stage and outcome — the audit trail behind the funnel above.`}>
        {decisions.length === 0 ? (
          <Empty title="No matching runs in this period" icon="chart" />
        ) : (
          <Breakdown rows={decisions.slice(0, 8).map((d) => ({ label: `${d.stage} — ${d.outcome.toLowerCase()}`, value: d.count }))} />
        )}
      </Card>

      <Card title="Demand without supply" description="Requests that arrived with nobody covering the area. Not range-bound — this is the all-time list, same data as the operational queue.">
        {gaps.length === 0 ? (
          <Empty title="No gaps recorded" icon="check" />
        ) : (
          <Table head={["Trade", "Area", "Requests"]}>
            {gaps.map((g, i) => (
              <Row key={i}>
                <Cell><strong>{g.category}</strong></Cell>
                <Cell>{g.place}</Cell>
                <Cell className="tabular-nums">{g.requests}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
