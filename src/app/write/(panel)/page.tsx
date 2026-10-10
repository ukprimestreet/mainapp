import Link from "next/link";
import { Activity, BarChart, Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Progress, Row, Table, btn } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { MIN_TO_SUBMIT, completeness } from "@/lib/author-profile";
import { ARTICLE_STATUS, type ArticleStatus } from "@/lib/editorial-flow";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { writerPublished } from "@/lib/analytics";
import { db } from "@/lib/db";
import { createArticle } from "../article-actions";

export const dynamic = "force-dynamic";

const ago = (d: Date) => {
  const h = Math.round((Date.now() - d.getTime()) / 3600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default async function WriterHome({ searchParams }: { searchParams: Promise<{ terms?: string }> }) {
  const me = await requireAuthor();
  const { terms } = await searchParams;
  const c = completeness(me);

  const [mine, published, inReview, drafts, lastDecision, decisions, series] = await Promise.all([
    db.article.findMany({ where: { authorId: me.id }, orderBy: { updatedAt: "desc" }, take: 6, include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    db.article.count({ where: { authorId: me.id, status: "PUBLISHED" } }),
    db.article.count({ where: { authorId: me.id, status: "SUBMITTED" } }),
    db.article.count({ where: { authorId: me.id, status: "DRAFT" } }),
    db.articleReview.findFirst({ where: { article: { authorId: me.id } }, orderBy: { createdAt: "desc" }, include: { article: true } }),
    db.articleReview.findMany({ where: { article: { authorId: me.id } }, orderBy: { createdAt: "desc" }, take: 5, include: { article: { select: { title: true, id: true } } } }),
    writerPublished(me.id, 90),
  ]);

  const blocked = !c.enough || !c.termsAccepted;
  const approved = decisions.filter((d) => d.decision === "APPROVED").length;
  const rate = decisions.length ? Math.round((approved / decisions.length) * 100) : null;

  return (
    <>
      <PageHead
        title={`Good to see you, ${me.name.split(" ")[0]}`}
        subtitle="Your drafts, what an editor has said, and anything still standing between you and filing."
        actions={blocked
          ? <Link href="/write/profile" className={btn()}>Complete your profile</Link>
          : <form action={createArticle}><button className={btn()}>Start a new piece</button></form>}
      />

      {terms === "1" && <Notice tone="good" title="Thank you">You have accepted the author terms.</Notice>}

      {blocked && (
        <Notice tone="warn" title="Before you can file">
          <p className="font-bold">
            {!c.termsAccepted
              ? `Accept the author terms and get your profile to ${MIN_TO_SUBMIT}%.`
              : `Your profile is ${c.percent}% complete. It needs ${MIN_TO_SUBMIT}% before you can send work for review.`}
          </p>
          <p className="mt-1 text-[14px]">Readers should be able to see who wrote a piece and why they are worth reading. That is the only reason we ask.</p>
          <div className="mt-4 max-w-md"><Progress percent={c.percent} target={MIN_TO_SUBMIT} label="Profile complete" /></div>
          {c.missing.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">{c.missing.map((m) => <li key={m.key}><Chip tone="draft">{m.label}</Chip></li>)}</ul>
          )}
          <p className="mt-4 text-[14px]">
            <Link href="/write/profile" className="font-bold underline">Finish your profile →</Link>
            {!c.termsAccepted && <> · <Link href="/write/terms" className="font-bold underline">Read the terms →</Link></>}
          </p>
        </Notice>
      )}

      <MetricRow>
        <Metric label="Profile" value={`${c.percent}%`} icon="users" tone={c.enough ? "accent" : "warn"} hint={c.enough ? "Enough to file" : `${MIN_TO_SUBMIT}% needed`} href="/write/profile" />
        <Metric label="Published" value={published} series={series} icon="file" href="/write/articles" />
        <Metric label="In review" value={inReview} icon="check" hint={inReview ? "An editor is reading" : "Nothing waiting"} href="/write/articles" />
        <Metric label="Drafts" value={drafts} icon="pen" hint="Private until you submit" href="/write/articles" />
      </MetricRow>

      {lastDecision && (
        <Notice tone={lastDecision.decision === "APPROVED" ? "good" : "bad"}>
          <p className="font-bold">{lastDecision.article.title}</p>
          <p className="mt-1">{lastDecision.note}</p>
          <p className="mt-2 text-[13px] text-grey">{fmtDate(lastDecision.createdAt)}</p>
        </Notice>
      )}

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card title="Recent work" action={<Link href="/write/articles" className="font-bold underline">See all</Link>}>
            {mine.length === 0 ? (
              <Empty
                title="Nothing written yet" icon="pen"
                action={blocked
                  ? <Link href="/write/profile" className={btn("ghost")}>Complete your profile first</Link>
                  : <form action={createArticle}><button className={btn()}>Start a new piece</button></form>}
              >
                Drafts are private until an editor approves them.
              </Empty>
            ) : (
              <Table head={["Piece", "Type", "Status", "Updated", ""]}>
                {mine.map((a) => {
                  const changes = a.status === "DRAFT" && a.reviews[0]?.decision === "CHANGES_REQUESTED";
                  return (
                    <Row key={a.id}>
                      <Cell className="font-semibold [overflow-wrap:anywhere]">{a.title || <span className="text-grey">Untitled draft</span>}</Cell>
                      <Cell className="whitespace-nowrap text-grey">{ARTICLE_TYPES[a.type as ArticleType]?.label ?? a.type}</Cell>
                      <Cell>
                        <Chip tone={a.status === "PUBLISHED" ? "live" : a.status === "SUBMITTED" ? "review" : changes ? "bad" : "draft"}>
                          {changes ? "Changes requested" : ARTICLE_STATUS[a.status as ArticleStatus]?.label ?? a.status}
                        </Chip>
                      </Cell>
                      <Cell className="whitespace-nowrap text-grey">{fmtDate(a.updatedAt)}</Cell>
                      <Cell><Link href={`/write/articles/${a.id}`} className="font-bold underline">Open</Link></Cell>
                    </Row>
                  );
                })}
              </Table>
            )}
          </Card>

          {series.total > 0 && (
            <Card title="What you have published" description="Last 90 days.">
              <BarChart series={series} label="Pieces published" height={120} />
            </Card>
          )}
        </div>

        <div className="min-w-0">
          {rate !== null && (
            <Card title="Your record" description="Across your last few decisions.">
              <Metric label="Published first time" value={`${rate}%`} hint={`${approved} of ${decisions.length} recent decisions`} />
              <p className="mt-2 text-[13px] text-grey">
                A piece coming back is normal and not a mark against you. Most returns are a missing source or a figure without a date.
              </p>
            </Card>
          )}

          <Card title="Editor decisions">
            <Activity items={decisions.map((d) => ({
              icon: d.decision === "APPROVED" ? ("check" as const) : ("pen" as const),
              title: <>{d.decision === "APPROVED" ? "Published" : "Changes requested"}: <strong>{d.article.title}</strong></>,
              meta: ago(d.createdAt),
              href: `/write/articles/${d.article.id}`,
            }))} />
          </Card>

          <Card title="House rules" description="The short version.">
            <ul className="space-y-2.5 text-[14px]">
              <li><strong>Name your sources.</strong> Primary ones, with the date you checked.</li>
              <li><strong>Never invent.</strong> No made-up businesses, quotes or figures.</li>
              <li><strong>Label anything paid for.</strong> Name the sponsor.</li>
              <li><strong>Own your corrections.</strong> Tell an editor as soon as you spot one.</li>
            </ul>
            <Link href="/write/terms" className={`${btn("ghost")} mt-4 w-full`}>Read the full terms</Link>
          </Card>
        </div>
      </div>
    </>
  );
}
