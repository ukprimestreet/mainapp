import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, Notice, btn } from "@/components/Dash";
import { adminAuthor } from "@/lib/author-auth";
import { parseBlocks } from "@/lib/blocks";
import { ARTICLE_STATUS, type ArticleStatus } from "@/lib/editorial-flow";
import { db } from "@/lib/db";
import { adminPublishArticle, adminSaveArticle } from "../../../compose-actions";
import { ArticleWorkbench } from "@/app/write/(panel)/articles/[id]/ArticleWorkbench";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> };

export default async function AdminCompose({ params, searchParams }: P) {
  const { id } = await params; const { msg } = await searchParams;
  const [article, locations, house] = await Promise.all([
    db.article.findUnique({ where: { id }, include: { author: true } }),
    db.location.findMany({ where: { kind: "BOROUGH" }, orderBy: { name: "asc" }, include: { city: true } }),
    adminAuthor(),
  ]);
  if (!article) notFound();

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/compose" className="font-bold underline">← House drafts</Link></p>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold leading-tight [overflow-wrap:anywhere]">{article.title || "Untitled draft"}</h1>
          <p className="mt-1 text-grey">
            Filed under <strong>{article.author.name}</strong>{article.author.email ? ` (${article.author.email})` : ""}
            {article.authorId === house.id ? " — the house account" : ""}.
          </p>
        </div>
        <Chip tone={article.status === "PUBLISHED" ? "live" : article.status === "SUBMITTED" ? "review" : "draft"}>
          {ARTICLE_STATUS[article.status as ArticleStatus]?.label ?? article.status}
        </Chip>
      </div>
      {msg && <Notice tone="info" title="Note">{msg}</Notice>}

      {article.status === "PUBLISHED" ? (
        <Notice tone="good" title="Published">
          This piece is live. <Link href={`/admin/articles/${article.id}`} className="font-bold underline">Edit it in the article editor →</Link>
        </Notice>
      ) : (
        <ArticleWorkbench
          article={JSON.parse(JSON.stringify(article))}
          blocks={parseBlocks(article.blocks)}
          locations={locations.map((l) => ({ id: l.id, name: l.name, city: l.city.name }))}
          canSubmit
          submitBlockedReason={null}
          saveAction={adminSaveArticle}
          submitAction={adminPublishArticle}
          submitLabel="Publish now"
          submitHint="You are the editor, so this publishes straight away. Save your draft first."
        />
      )}
    </>
  );
}
