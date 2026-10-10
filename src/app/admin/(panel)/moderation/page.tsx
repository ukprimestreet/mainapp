import Link from "next/link";
import { Card, Cell, Chip, Empty, Metric, MetricRow, PageHead, Row, Table } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const age = (d: Date) => {
  const h = Math.round((Date.now() - d.getTime()) / 3600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};
const stale = (d: Date) => Date.now() - d.getTime() > 3 * 86400_000;

/**
 * One queue instead of four. Ratings, claims, submissions and owner requests all compete for the same
 * attention, and four separate badges is how something ends up sitting for a fortnight.
 */
export default async function Moderation() {
  const [ratings, reported, claims, subs, changes, pitches] = await Promise.all([
    db.review.findMany({ where: { status: "PENDING" }, include: { business: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 40 }),
    db.review.findMany({ where: { status: "PUBLISHED", reports: { some: { status: "OPEN" } } }, include: { business: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 20 }),
    db.claimRequest.findMany({ where: { status: { in: ["PENDING", "NEEDS_INFO"] } }, include: { business: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 30 }),
    db.businessSubmission.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 30 }),
    db.profileChangeRequest.findMany({ where: { status: "OPEN" }, include: { business: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 30 }),
    db.coverageRequest.findMany({ where: { status: { in: ["NEW", "CONSIDERING"] } }, include: { business: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 30 }),
  ]);

  const items = [
    ...ratings.map((r) => ({ kind: "Rating", tone: "review" as const, what: `${r.rating}★ on ${r.business.name}`, detail: r.title, at: r.createdAt, href: "/admin/reviews?tab=pending" })),
    ...reported.map((r) => ({ kind: "Reported", tone: "bad" as const, what: `${r.rating}★ on ${r.business.name}`, detail: r.title, at: r.createdAt, href: "/admin/reviews?tab=reported" })),
    ...claims.map((c) => ({ kind: "Claim", tone: "quiet" as const, what: c.business.name, detail: c.email, at: c.createdAt, href: "/admin/claims" })),
    ...subs.map((s) => ({ kind: "Submission", tone: "quiet" as const, what: s.name, detail: s.submitterName ? `${s.submitterName} · ${s.description.slice(0, 60)}` : s.description.slice(0, 80), at: s.createdAt, href: "/admin/submissions" })),
    ...changes.map((c) => ({ kind: "Change request", tone: "quiet" as const, what: c.business.name, detail: c.message.slice(0, 80), at: c.createdAt, href: "/admin/owner-inbox" })),
    ...pitches.map((c) => ({ kind: "Story pitch", tone: "quiet" as const, what: c.business.name, detail: `${c.topic}: ${c.details.slice(0, 60)}`, at: c.createdAt, href: "/admin/owner-inbox" })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const overdue = items.filter((i) => stale(i.at)).length;

  return (
    <>
      <PageHead
        title="Moderation"
        subtitle="Everything waiting on a human decision, oldest first. Four separate queues is how something ends up sitting for a fortnight."
      />

      <MetricRow>
        <Metric label="Waiting" value={items.length} icon="inbox" tone={items.length ? "accent" : "plain"} />
        <Metric label="Over three days" value={overdue} icon="bolt" tone={overdue ? "warn" : "plain"} hint={overdue ? "Deal with these first" : "Nothing is stale"} />
        <Metric label="Ratings" value={ratings.length + reported.length} icon="star" href="/admin/reviews" />
        <Metric label="Businesses" value={claims.length + subs.length} icon="shop" href="/admin/claims" />
      </MetricRow>

      <Card title="The queue" description="Oldest at the top. Each row opens the screen where you can act on it.">
        {items.length === 0 ? (
          <Empty title="All clear" icon="check">Nothing is waiting for a decision.</Empty>
        ) : (
          <Table head={["Waiting", "Kind", "What", "Detail", ""]}>
            {items.map((i, n) => (
              <Row key={n}>
                <Cell className="whitespace-nowrap">
                  <span className={stale(i.at) ? "font-bold text-red-800" : "text-grey"}>{age(i.at)}</span>
                  <br /><span className="text-[12px] text-grey">{fmtDate(i.at)}</span>
                </Cell>
                <Cell><Chip tone={i.tone}>{i.kind}</Chip></Cell>
                <Cell className="font-semibold [overflow-wrap:anywhere]">{i.what}</Cell>
                <Cell className="max-w-sm text-grey [overflow-wrap:anywhere]">{i.detail || "—"}</Cell>
                <Cell><Link href={i.href} className="font-bold underline">Open</Link></Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
