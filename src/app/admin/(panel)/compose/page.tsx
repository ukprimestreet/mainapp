import Link from "next/link";
import { Cell, Chip, DashTable, Empty, Notice, Panel, Row, btn } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { adminAuthor } from "@/lib/author-auth";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { db } from "@/lib/db";
import { adminCreateArticle } from "../../compose-actions";

export const dynamic = "force-dynamic";

export default async function Compose({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const house = await adminAuthor();
  const drafts = await db.article.findMany({
    where: { authorId: house.id, status: { in: ["DRAFT", "SUBMITTED"] } },
    orderBy: { updatedAt: "desc" }, take: 40,
  });
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Write</h1>
          <p className="mt-1 max-w-2xl text-grey">
            The same editor the writers use. Anything you write here is filed under{" "}
            <strong>{house.name}</strong> ({house.email}), so whoever owns that account can carry on editing it from their own panel.
          </p>
        </div>
        <form action={adminCreateArticle}><button className={btn()}>Start a new piece</button></form>
      </div>
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <Panel title="House drafts">
        {drafts.length === 0 ? (
          <Empty title="No drafts" action={<form action={adminCreateArticle}><button className={btn()}>Start a new piece</button></form>}>
            Pieces you start here appear in this list.
          </Empty>
        ) : (
          <DashTable head={["Piece", "Type", "Status", "Updated", ""]}>
            {drafts.map((a) => (
              <Row key={a.id}>
                <Cell className="font-bold [overflow-wrap:anywhere]">{a.title || <span className="text-grey">Untitled draft</span>}</Cell>
                <Cell className="whitespace-nowrap">{ARTICLE_TYPES[a.type as ArticleType]?.label ?? a.type}</Cell>
                <Cell><Chip tone={a.status === "SUBMITTED" ? "review" : "draft"}>{a.status === "SUBMITTED" ? "In review" : "Draft"}</Chip></Cell>
                <Cell className="whitespace-nowrap text-grey">{fmtDate(a.updatedAt)}</Cell>
                <Cell><Link href={`/admin/compose/${a.id}`} className="font-bold underline">Open</Link></Cell>
              </Row>
            ))}
          </DashTable>
        )}
      </Panel>
    </>
  );
}
