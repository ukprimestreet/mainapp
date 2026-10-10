import Link from "next/link";
import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, area, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { db } from "@/lib/db";
import { addCorrection, removeCorrection } from "../../ops-actions";

export const dynamic = "force-dynamic";
const KINDS = { CORRECTION: "Correction", CLARIFICATION: "Clarification", UPDATE: "Update" } as const;

export default async function Corrections({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const [rows, articles, thisYear] = await Promise.all([
    db.correction.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { article: { select: { title: true, slug: true, type: true } } } }),
    db.article.findMany({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 200, select: { id: true, title: true } }),
    db.correction.count({ where: { createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } } }),
  ]);

  return (
    <>
      <PageHead
        title="Corrections"
        subtitle="When we get something wrong we say so, in public, with the date. A title that corrects itself openly is worth more than one that quietly edits."
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <MetricRow cols={3}>
        <Metric label="Corrections this year" value={thisYear} icon="shield" />
        <Metric label="All time" value={rows.length} icon="file" />
        <Metric label="Published articles" value={articles.length} icon="pen" hint="Eligible for a correction" />
      </MetricRow>

      <Card title="Publish a correction" description="The summary is shown to readers on the article itself.">
        <form action={addCorrection} className="grid max-w-3xl gap-4">
          <div>
            <label className={labelCls} htmlFor="articleId">Which article</label>
            <select id="articleId" name="articleId" required className={field}>
              <option value="">Choose an article…</option>
              {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="kind">Type</label>
              <select id="kind" name="kind" className={field}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="raisedBy">Who spotted it (optional)</label>
              <input id="raisedBy" name="raisedBy" className={field} placeholder="A reader, the business, an editor" />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="summary">What was wrong, and what it says now</label>
            <textarea id="summary" name="summary" rows={3} required className={area}
              placeholder="An earlier version said the relief threshold was £15,000. It is £12,000. Corrected on 10 October 2026." />
          </div>
          <div>
            <label className={labelCls} htmlFor="detail">Fuller explanation (optional)</label>
            <textarea id="detail" name="detail" rows={2} className={area} />
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="isPublic" value="1" defaultChecked className="h-5 w-5" /> Show this on the article
          </label>
          <div><button className={btn()}>Publish correction</button></div>
        </form>
      </Card>

      <Card title="The record">
        {rows.length === 0 ? (
          <Empty title="No corrections yet" icon="shield">
            That is not necessarily good news — it may simply mean nobody has checked. Corrections are normal and healthy.
          </Empty>
        ) : (
          <Table head={["Article", "Type", "What changed", "Public", "When", ""]}>
            {rows.map((c) => (
              <Row key={c.id}>
                <Cell className="font-semibold [overflow-wrap:anywhere]">
                  <Link href={`/${ARTICLE_TYPES[c.article.type as ArticleType]?.path ?? "news"}/${c.article.slug}`} className="underline">{c.article.title}</Link>
                </Cell>
                <Cell><Chip tone={c.kind === "CORRECTION" ? "bad" : "quiet"}>{KINDS[c.kind as keyof typeof KINDS] ?? c.kind}</Chip></Cell>
                <Cell className="max-w-md text-grey [overflow-wrap:anywhere]">{c.summary}</Cell>
                <Cell>{c.isPublic ? <Chip tone="live">Shown</Chip> : <Chip tone="draft">Hidden</Chip>}</Cell>
                <Cell className="whitespace-nowrap text-grey">{fmtDate(c.createdAt)}<br /><span className="text-[12px]">{c.correctedBy}</span></Cell>
                <Cell>
                  <form action={removeCorrection}><input type="hidden" name="id" value={c.id} /><button className="text-[13px] font-bold text-red-800 underline">Remove</button></form>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
