import Link from "next/link";
import { Cell, Chip, DashShell, DashTable, Empty, Notice, Panel, Row, btn } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { canSubmit } from "@/lib/author-profile";
import { ARTICLE_STATUS, type ArticleStatus } from "@/lib/editorial-flow";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { db } from "@/lib/db";
import { createArticle } from "../../article-actions";

export const dynamic = "force-dynamic";

export default async function MyWork({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireAuthor();
  const { msg } = await searchParams;
  const gate = canSubmit(me);
  const articles = await db.article.findMany({
    where: { authorId: me.id },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <DashShell
      title="My work"
      subtitle="Drafts are private. Submitting sends a piece to an editor, who always replies with a reason."
      actions={gate.ok
        ? <form action={createArticle}><button className={btn()}>Start a new piece</button></form>
        : <Link href="/write/profile" className={btn()}>Complete your profile to write</Link>}
    >
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}
      {!gate.ok && <Notice tone="warn">{gate.reason} <Link href="/write/profile" className="font-bold underline">Finish your profile →</Link></Notice>}

      <Panel title={`${articles.length} ${articles.length === 1 ? "piece" : "pieces"}`}>
        {articles.length === 0 ? (
          <Empty title="Nothing written yet" action={gate.ok ? <form action={createArticle}><button className={btn()}>Start a new piece</button></form> : undefined}>
            Your drafts will live here.
          </Empty>
        ) : (
          <DashTable head={["Piece", "Type", "Status", "Editor's note", "Updated", ""]}>
            {articles.map((a) => {
              const last = a.reviews[0];
              const changes = a.status === "DRAFT" && last?.decision === "CHANGES_REQUESTED";
              return (
                <Row key={a.id}>
                  <Cell className="font-bold [overflow-wrap:anywhere]">{a.title || <span className="text-grey">Untitled draft</span>}</Cell>
                  <Cell className="whitespace-nowrap">{ARTICLE_TYPES[a.type as ArticleType]?.label ?? a.type}</Cell>
                  <Cell>
                    <Chip tone={a.status === "PUBLISHED" ? "live" : a.status === "SUBMITTED" ? "review" : changes ? "bad" : "draft"}>
                      {changes ? "Changes requested" : ARTICLE_STATUS[a.status as ArticleStatus]?.label ?? a.status}
                    </Chip>
                  </Cell>
                  <Cell className="max-w-sm text-grey [overflow-wrap:anywhere]">{last ? last.note : "—"}</Cell>
                  <Cell className="whitespace-nowrap text-grey">{fmtDate(a.updatedAt)}</Cell>
                  <Cell>
                    <div className="flex flex-col gap-1 text-sm">
                      <Link href={`/write/articles/${a.id}`} className="font-bold underline">{a.status === "DRAFT" ? "Edit" : "Open"}</Link>
                      {a.status === "PUBLISHED" && (
                        <Link href={`/${ARTICLE_TYPES[a.type as ArticleType]?.path ?? "news"}/${a.slug}`} className="underline">View live</Link>
                      )}
                    </div>
                  </Cell>
                </Row>
              );
            })}
          </DashTable>
        )}
      </Panel>
    </DashShell>
  );
}
