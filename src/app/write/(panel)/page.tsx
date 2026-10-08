import Link from "next/link";
import { Chip, DashShell, DashTable, Cell, Empty, Notice, Panel, Progress, Row, Stat, StatRow, btn } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { MIN_TO_SUBMIT, completeness } from "@/lib/author-profile";
import { ARTICLE_STATUS, type ArticleStatus } from "@/lib/editorial-flow";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function WriterHome({ searchParams }: { searchParams: Promise<{ terms?: string }> }) {
  const me = await requireAuthor();
  const { terms } = await searchParams;
  const c = completeness(me);
  const [mine, published, inReview, lastDecision] = await Promise.all([
    db.article.findMany({ where: { authorId: me.id }, orderBy: { updatedAt: "desc" }, take: 6, include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    db.article.count({ where: { authorId: me.id, status: "PUBLISHED" } }),
    db.article.count({ where: { authorId: me.id, status: "SUBMITTED" } }),
    db.articleReview.findFirst({ where: { article: { authorId: me.id } }, orderBy: { createdAt: "desc" }, include: { article: true } }),
  ]);
  const blocked = !c.enough || !c.termsAccepted;

  return (
    <DashShell
      title={`Good to see you, ${me.name.split(" ")[0]}`}
      subtitle="Your drafts, what an editor has said, and anything still blocking you from filing."
      actions={blocked
        ? <Link href="/write/profile" className={btn()}>Complete your profile</Link>
        : <Link href="/write/articles/new" className={btn()}>Start a new piece</Link>}
    >
      {terms === "1" && <Notice tone="good" title="Thank you">You have accepted the author terms.</Notice>}

      {blocked && (
        <Notice tone="warn" title="Before you can file">
          <p className="font-bold">
            {!c.termsAccepted
              ? "Accept the author terms and complete your profile to at least " + MIN_TO_SUBMIT + "%."
              : `Your profile is ${c.percent}% complete. It needs ${MIN_TO_SUBMIT}% before you can send work for review.`}
          </p>
          <p className="mt-1 text-sm">
            Readers should be able to see who wrote a piece and why they are worth reading. That is the only reason we ask.
          </p>
          <div className="mt-4 max-w-md"><Progress percent={c.percent} target={MIN_TO_SUBMIT} label="Profile complete" /></div>
          {c.missing.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {c.missing.map((m) => <li key={m.key}><Chip tone="draft">{m.label}</Chip></li>)}
            </ul>
          )}
          <p className="mt-4">
            <Link href="/write/profile" className="font-bold underline">Finish your profile →</Link>
            {!c.termsAccepted && <> · <Link href="/write/terms" className="font-bold underline">Read the author terms →</Link></>}
          </p>
        </Notice>
      )}

      <StatRow>
        <Stat label="Profile complete" value={`${c.percent}%`} hint={c.enough ? "Enough to file" : `${MIN_TO_SUBMIT}% needed`} tone={c.enough ? "accent" : "warn"} href="/write/profile" />
        <Stat label="Published" value={published} hint="Live on PrimeStreet" href="/write/articles" />
        <Stat label="In review" value={inReview} hint={inReview ? "An editor is reading" : "Nothing waiting"} href="/write/articles" />
        <Stat label="Drafts" value={mine.filter((a) => a.status === "DRAFT").length} hint="Only you can see these" href="/write/articles" />
      </StatRow>

      {lastDecision && (
        <Notice tone={lastDecision.decision === "APPROVED" ? "good" : "bad"}>
          <p className="font-bold">{lastDecision.article.title}</p>
          <p className="mt-1">{lastDecision.note}</p>
          <p className="mt-2 text-sm text-grey">{fmtDate(lastDecision.createdAt)}</p>
        </Notice>
      )}

      <Panel title="Recent work" action={<Link href="/write/articles" className="font-bold underline">See all</Link>}>
        {mine.length === 0 ? (
          <Empty title="Nothing here yet" action={blocked ? <Link href="/write/profile" className={btn("ghost")}>Complete your profile first</Link> : <Link href="/write/articles/new" className={btn()}>Start a new piece</Link>}>
            Drafts are private until an editor approves them.
          </Empty>
        ) : (
          <DashTable head={["Piece", "Type", "Status", "Updated", ""]}>
            {mine.map((a) => {
              const st = ARTICLE_STATUS[a.status as ArticleStatus];
              const changes = a.status === "DRAFT" && a.reviews[0]?.decision === "CHANGES_REQUESTED";
              return (
                <Row key={a.id}>
                  <Cell className="font-bold [overflow-wrap:anywhere]">{a.title || "Untitled"}</Cell>
                  <Cell>{ARTICLE_TYPES[a.type as ArticleType]?.label ?? a.type}</Cell>
                  <Cell>
                    <Chip tone={a.status === "PUBLISHED" ? "live" : a.status === "SUBMITTED" ? "review" : changes ? "bad" : "draft"}>
                      {changes ? "Changes requested" : st?.label ?? a.status}
                    </Chip>
                  </Cell>
                  <Cell className="whitespace-nowrap text-grey">{fmtDate(a.updatedAt)}</Cell>
                  <Cell><Link href={`/write/articles/${a.id}`} className="font-bold underline">Open</Link></Cell>
                </Row>
              );
            })}
          </DashTable>
        )}
      </Panel>
    </DashShell>
  );
}
