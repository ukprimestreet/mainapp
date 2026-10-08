import Link from "next/link";
import { Chip, DashShell, Notice, Panel, btn } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireOwnArticle } from "@/lib/author-auth";
import { canSubmit } from "@/lib/author-profile";
import { parseBlocks } from "@/lib/blocks";
import { ARTICLE_STATUS, type ArticleStatus } from "@/lib/editorial-flow";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { db } from "@/lib/db";
import { deleteArticle, saveArticle, submitArticle, withdrawArticle } from "../../../article-actions";
import { ArticleWorkbench } from "./ArticleWorkbench";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> };

export default async function EditArticle({ params, searchParams }: P) {
  const { id } = await params; const { msg } = await searchParams;
  const { author, article } = await requireOwnArticle(id);
  const [locations, gate] = await Promise.all([
    db.location.findMany({ where: { kind: "BOROUGH" }, orderBy: { name: "asc" }, include: { city: true } }),
    Promise.resolve(canSubmit(author)),
  ]);
  const last = article.reviews[0];
  const editable = article.status === "DRAFT";
  const path = ARTICLE_TYPES[article.type as ArticleType]?.path ?? "news";

  return (
    <DashShell
      title={article.title || "Untitled draft"}
      subtitle={ARTICLE_STATUS[article.status as ArticleStatus]?.help}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={article.status === "PUBLISHED" ? "live" : article.status === "SUBMITTED" ? "review" : "draft"}>
            {ARTICLE_STATUS[article.status as ArticleStatus]?.label ?? article.status}
          </Chip>
          <Link href="/write/articles" className={btn("ghost")}>All my work</Link>
          {article.status === "PUBLISHED" && <Link href={`/${path}/${article.slug}`} className={btn("ghost")}>View live</Link>}
        </div>
      }
    >
      {msg && <Notice tone="warn" title="Note">{msg}</Notice>}

      {last && (
        <Notice tone={last.decision === "APPROVED" ? "good" : "bad"}>
          <p>{last.note}</p>
          <p className="mt-2 text-sm text-grey">{fmtDate(last.createdAt)}</p>
        </Notice>
      )}

      {article.status === "SUBMITTED" && (
        <Notice tone="info" title="With an editor">
          <p>Submitted {article.submittedAt ? fmtDate(article.submittedAt) : "recently"}. You cannot edit it while it is being read.</p>
          <form action={withdrawArticle} className="mt-3">
            <input type="hidden" name="id" value={article.id} />
            <button className={btn("ghost")}>Pull it back to a draft</button>
          </form>
        </Notice>
      )}

      {article.status === "PUBLISHED" && (
        <Notice tone="good" title="Published">This piece is live. Ask an editor if it needs changing.</Notice>
      )}

      {editable ? (
        <ArticleWorkbench
          article={JSON.parse(JSON.stringify(article))}
          blocks={parseBlocks(article.blocks)}
          locations={locations.map((l) => ({ id: l.id, name: l.name, city: l.city.name }))}
          canSubmit={gate.ok}
          submitBlockedReason={gate.ok ? null : gate.reason}
          saveAction={saveArticle}
          submitAction={submitArticle}
        />
      ) : (
        <Panel title="The piece">
          <p className="font-bold">{article.standfirst}</p>
          <p className="mt-4 whitespace-pre-wrap text-grey [overflow-wrap:anywhere]">{article.body.slice(0, 4000)}</p>
        </Panel>
      )}

      {editable && (
        <form action={deleteArticle} className="mt-4">
          <input type="hidden" name="id" value={article.id} />
          <button className="text-sm font-bold text-red-800 underline">Delete this draft</button>
        </form>
      )}
      {editable && gate.ok && (
        <form action={submitArticle} className="hidden" id="submit-form">
          <input type="hidden" name="id" value={article.id} />
        </form>
      )}
    </DashShell>
  );
}
