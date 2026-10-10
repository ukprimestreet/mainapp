import Link from "next/link";
import { BarChart, Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { buildSeries, dayKey, daysAgo } from "@/lib/analytics";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Performance() {
  const me = await requireAuthor();
  const since = dayKey(daysAgo(29));

  const [articles, stats, prevAgg] = await Promise.all([
    db.article.findMany({
      where: { authorId: me.id, status: "PUBLISHED", publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: "desc" },
      include: { _count: { select: { corrections: true } } },
    }),
    db.articleStat.findMany({ where: { article: { authorId: me.id }, day: { gte: since } } }),
    db.articleStat.aggregate({
      where: { article: { authorId: me.id }, day: { gte: dayKey(daysAgo(59)), lte: dayKey(daysAgo(30)) } },
      _sum: { views: true },
    }),
  ]);

  const series = buildSeries(stats.map((s) => ({ day: s.day, value: s.views })), 30, prevAgg._sum.views ?? 0);
  const byArticle = new Map<string, number>();
  for (const s of stats) byArticle.set(s.articleId, (byArticle.get(s.articleId) ?? 0) + s.views);
  const ranked = [...articles].sort((a, b) => (byArticle.get(b.id) ?? 0) - (byArticle.get(a.id) ?? 0));
  const best = ranked[0];
  const totalViews = series.total;
  const corrections = articles.reduce((n, a) => n + a._count.corrections, 0);

  return (
    <>
      <PageHead
        title="Performance"
        subtitle="How your published work is doing. These are counted page views, not estimates — and a quiet piece is not a bad piece."
      />

      {articles.length === 0 ? (
        <Empty title="Nothing published yet" icon="chart" action={<Link href="/write/articles" className="font-bold underline">Go to my work</Link>}>
          Once an editor publishes a piece, its readership appears here.
        </Empty>
      ) : (
        <>
          <MetricRow>
            <Metric label="Reads" value={totalViews.toLocaleString()} series={series} icon="chart" tone="accent" hint="Last 30 days" />
            <Metric label="Published" value={articles.length} icon="file" />
            <Metric label="Best piece" value={best ? (byArticle.get(best.id) ?? 0).toLocaleString() : 0} icon="star" hint={best?.title.slice(0, 40)} />
            <Metric label="Corrections" value={corrections} icon="shield" tone={corrections ? "warn" : "plain"} hint={corrections ? "On your published work" : "None"} />
          </MetricRow>

          {totalViews === 0 && (
            <Notice tone="info" title="No reads recorded yet">
              Readership is counted from real page views. If your work has only just gone live, give it a few days.
            </Notice>
          )}

          {totalViews > 0 && (
            <Card title="Reads" description="Across everything you have published, last 30 days.">
              <BarChart series={series} label="Reads of your work" />
            </Card>
          )}

          <Card title="Every piece" description="Ordered by reads in the last 30 days.">
            <Table head={["Piece", "Section", "Published", "Reads", ""]}>
              {ranked.map((a) => (
                <Row key={a.id}>
                  <Cell className="font-semibold [overflow-wrap:anywhere]">
                    {a.title}
                    {a._count.corrections > 0 && <span className="ml-2 align-middle"><Chip tone="bad">corrected</Chip></span>}
                  </Cell>
                  <Cell className="whitespace-nowrap text-grey">{ARTICLE_TYPES[a.type as ArticleType]?.label ?? a.type}</Cell>
                  <Cell className="whitespace-nowrap text-grey">{a.publishedAt ? fmtDate(a.publishedAt) : "—"}</Cell>
                  <Cell className="font-display font-extrabold tabular-nums">{(byArticle.get(a.id) ?? 0).toLocaleString()}</Cell>
                  <Cell>
                    <Link href={`/${ARTICLE_TYPES[a.type as ArticleType]?.path ?? "news"}/${a.slug}`} className="font-bold underline">View</Link>
                  </Cell>
                </Row>
              ))}
            </Table>
          </Card>

          <Card title="What these numbers are, and are not">
            <ul className="space-y-2 text-[14px] text-grey">
              <li><strong className="text-ink">Counted, not modelled.</strong> One row per page view, no sampling and no estimate.</li>
              <li><strong className="text-ink">Reads are not worth.</strong> A careful piece read by 200 of the right people beats a cheap one read by 2,000.</li>
              <li><strong className="text-ink">Nothing here affects your pay</strong> or whether we commission you again. Fees are agreed before the work.</li>
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
