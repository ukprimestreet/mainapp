import Link from "next/link";
import { Cell, Chip, DashTable, Empty, Notice, Panel, Row, Stat, StatRow } from "@/components/Dash";
import { Avatar } from "@/components/Social";
import { fmtDate } from "@/components/Cards";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { extractLinks, linkSummary } from "@/lib/links";
import { reviewQueue } from "@/lib/editorial-flow";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const since = (d: Date | null) => {
  if (!d) return "—";
  const h = Math.round((Date.now() - d.getTime()) / 3600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const [queue, decidedToday, oldest] = await Promise.all([
    reviewQueue(),
    db.articleReview.count({ where: { createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
    db.article.findFirst({ where: { status: "SUBMITTED" }, orderBy: { submittedAt: "asc" } }),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold">Review queue</h1>
        <p className="mt-1 text-grey">Pieces writers have submitted. Every decision needs a note — the writer reads it.</p>
      </div>
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <StatRow cols={3}>
        <Stat label="Waiting for review" value={queue.length} tone={queue.length ? "accent" : "plain"} hint={queue.length ? "Oldest first" : "Nothing waiting"} />
        <Stat label="Longest wait" value={since(oldest?.submittedAt ?? null)} hint="Since it was submitted" tone={oldest && Date.now() - oldest.submittedAt!.getTime() > 3 * 86400_000 ? "warn" : "plain"} />
        <Stat label="Decisions today" value={decidedToday} />
      </StatRow>

      <Panel title="Submitted">
        {queue.length === 0 ? (
          <Empty title="Nothing waiting">When a writer submits a piece it appears here.</Empty>
        ) : (
          <DashTable head={["Piece", "Writer", "Type", "Links", "Waiting", ""]}>
            {queue.map((a) => {
              const s = linkSummary(extractLinks(a.body + (a.imageUrl ? `\n![cover](${a.imageUrl})` : "")));
              return (
                <Row key={a.id}>
                  <Cell className="font-bold [overflow-wrap:anywhere]">{a.title}</Cell>
                  <Cell>
                    <div className="flex items-center gap-2">
                      <Avatar src={a.author.imageUrl} name={a.author.name} size={30} />
                      <span className="whitespace-nowrap">{a.author.name}</span>
                    </div>
                  </Cell>
                  <Cell>{ARTICLE_TYPES[a.type as ArticleType]?.label ?? a.type}</Cell>
                  <Cell>
                    <div className="flex flex-wrap gap-1">
                      <Chip tone="quiet">{s.total} total</Chip>
                      {s.external > 0 && <Chip tone="draft">{s.external} external</Chip>}
                      {s.videos > 0 && <Chip tone="draft">{s.videos} video</Chip>}
                      {s.unsafe > 0 && <Chip tone="bad">{s.unsafe} unsafe</Chip>}
                    </div>
                  </Cell>
                  <Cell className="whitespace-nowrap text-grey">{since(a.submittedAt)}</Cell>
                  <Cell><Link href={`/admin/review/${a.id}`} className="font-bold underline">Review</Link></Cell>
                </Row>
              );
            })}
          </DashTable>
        )}
      </Panel>

      <RecentDecisions />
    </>
  );
}

async function RecentDecisions() {
  const rows = await db.articleReview.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { article: { include: { author: true } } } });
  if (rows.length === 0) return null;
  return (
    <Panel title="Recent decisions">
      <DashTable head={["Piece", "Writer", "Decision", "Note", "When"]}>
        {rows.map((r) => (
          <Row key={r.id}>
            <Cell className="font-bold [overflow-wrap:anywhere]">{r.article.title}</Cell>
            <Cell className="whitespace-nowrap">{r.article.author.name}</Cell>
            <Cell><Chip tone={r.decision === "APPROVED" ? "live" : "bad"}>{r.decision === "APPROVED" ? "Approved" : "Changes"}</Chip></Cell>
            <Cell className="max-w-md text-grey [overflow-wrap:anywhere]">{r.note}</Cell>
            <Cell className="whitespace-nowrap text-grey">{fmtDate(r.createdAt)}</Cell>
          </Row>
        ))}
      </DashTable>
    </Panel>
  );
}
