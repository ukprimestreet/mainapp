import { db } from "./db";
import { isBotUA } from "./owner";

/**
 * Numbers for the dashboards. Everything here is counted from real rows — there is no sampling, no modelling
 * and no estimate anywhere, so a figure on a dashboard is a figure you could recount by hand.
 *
 * Series are returned as a dense day-by-day array (missing days become 0) so a chart never implies activity
 * on a day that had none, and so two series are always directly comparable.
 */
export type Point = { day: string; value: number };
export type Series = {
  points: Point[];
  total: number;
  previousTotal: number;
  /** Percentage change against the equally long window before this one. Null when there is nothing to compare to. */
  deltaPct: number | null;
  peak: number;
};

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

/** Every day in the window, oldest first, so charts have a stable x-axis. */
export function dayRange(days: number, end = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(new Date(end.getTime() - i * 86400_000)));
  return out;
}

export function buildSeries(rows: { day: string; value: number }[], days: number, previous: number): Series {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.value);
  const points = dayRange(days).map((day) => ({ day, value: byDay.get(day) ?? 0 }));
  const total = points.reduce((n, p) => n + p.value, 0);
  return {
    points, total, previousTotal: previous,
    deltaPct: previous > 0 ? Math.round(((total - previous) / previous) * 100) : null,
    peak: points.reduce((n, p) => Math.max(n, p.value), 0),
  };
}

/** Buckets rows that carry a timestamp (leads, orders, reviews, articles) into a daily series. */
export function seriesFromDates(dates: Date[], days: number, previousDates: Date[] = []): Series {
  const rows = dates.map((d) => ({ day: dayKey(d), value: 1 }));
  return buildSeries(rows, days, previousDates.length);
}

const since = (days: number) => dayKey(daysAgo(days - 1));
const between = (days: number) => ({ from: dayKey(daysAgo(days * 2 - 1)), to: dayKey(daysAgo(days)) });

// ---------------------------------------------------------------- business-level
export async function businessViews(businessId: string, days = 30): Promise<Series> {
  const prev = between(days);
  const [now, before] = await Promise.all([
    db.businessStat.findMany({ where: { businessId, day: { gte: since(days) } } }),
    db.businessStat.aggregate({ where: { businessId, day: { gte: prev.from, lte: prev.to } }, _sum: { views: true } }),
  ]);
  return buildSeries(now.map((r) => ({ day: r.day, value: r.views })), days, before._sum.views ?? 0);
}

export async function businessClicks(businessId: string, days = 30): Promise<Series> {
  const prev = between(days);
  const [now, before] = await Promise.all([
    db.businessClick.findMany({ where: { businessId, day: { gte: since(days) } } }),
    db.businessClick.aggregate({ where: { businessId, day: { gte: prev.from, lte: prev.to } }, _sum: { count: true } }),
  ]);
  return buildSeries(now.map((r) => ({ day: r.day, value: r.count })), days, before._sum.count ?? 0);
}

export async function businessEnquiries(businessId: string, days = 30): Promise<Series> {
  const [now, before] = await Promise.all([
    db.lead.findMany({ where: { businessId, createdAt: { gte: daysAgo(days) } }, select: { createdAt: true } }),
    db.lead.count({ where: { businessId, createdAt: { gte: daysAgo(days * 2), lt: daysAgo(days) } } }),
  ]);
  return buildSeries(now.map((r) => ({ day: dayKey(r.createdAt), value: 1 })), days, before);
}

// ---------------------------------------------------------------- site-wide (admin)
export async function siteViews(days = 30): Promise<Series> {
  const prev = between(days);
  const [now, before] = await Promise.all([
    db.businessStat.findMany({ where: { day: { gte: since(days) } } }),
    db.businessStat.aggregate({ where: { day: { gte: prev.from, lte: prev.to } }, _sum: { views: true } }),
  ]);
  return buildSeries(now.map((r) => ({ day: r.day, value: r.views })), days, before._sum.views ?? 0);
}

export async function siteSearches(days = 30): Promise<Series> {
  const prev = between(days);
  const [now, before] = await Promise.all([
    db.searchTerm.findMany({ where: { day: { gte: since(days) } } }),
    db.searchTerm.aggregate({ where: { day: { gte: prev.from, lte: prev.to } }, _sum: { count: true } }),
  ]);
  return buildSeries(now.map((r) => ({ day: r.day, value: r.count })), days, before._sum.count ?? 0);
}

export async function sitePublished(days = 30): Promise<Series> {
  const [now, before] = await Promise.all([
    db.article.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { gte: daysAgo(days) } }, select: { publishedAt: true } }),
    db.article.count({ where: { status: "PUBLISHED", isSample: false, publishedAt: { gte: daysAgo(days * 2), lt: daysAgo(days) } } }),
  ]);
  return buildSeries(now.filter((a) => a.publishedAt).map((a) => ({ day: dayKey(a.publishedAt!), value: 1 })), days, before);
}

export async function siteRevenue(days = 30): Promise<Series> {
  const [now, before] = await Promise.all([
    db.order.findMany({ where: { status: "PAID", createdAt: { gte: daysAgo(days) } }, select: { createdAt: true, amountPence: true } }),
    db.order.aggregate({ where: { status: "PAID", createdAt: { gte: daysAgo(days * 2), lt: daysAgo(days) } }, _sum: { amountPence: true } }),
  ]);
  return buildSeries(now.map((o) => ({ day: dayKey(o.createdAt), value: o.amountPence })), days, before._sum.amountPence ?? 0);
}

// ---------------------------------------------------------------- writer-level
export async function writerPublished(authorId: string, days = 90): Promise<Series> {
  const [now, before] = await Promise.all([
    db.article.findMany({ where: { authorId, status: "PUBLISHED", publishedAt: { gte: daysAgo(days) } }, select: { publishedAt: true } }),
    db.article.count({ where: { authorId, status: "PUBLISHED", publishedAt: { gte: daysAgo(days * 2), lt: daysAgo(days) } } }),
  ]);
  return buildSeries(now.filter((a) => a.publishedAt).map((a) => ({ day: dayKey(a.publishedAt!), value: 1 })), days, before);
}

/** How long submissions have been waiting — the number an editor should feel responsible for. */
export async function queueAge() {
  const rows = await db.article.findMany({ where: { status: "SUBMITTED" }, select: { submittedAt: true } });
  const ages = rows.filter((r) => r.submittedAt).map((r) => Date.now() - r.submittedAt!.getTime());
  return {
    count: rows.length,
    oldestHours: ages.length ? Math.round(Math.max(...ages) / 3600_000) : 0,
    medianHours: ages.length ? Math.round([...ages].sort((a, b) => a - b)[Math.floor(ages.length / 2)] / 3600_000) : 0,
  };
}

/**
 * Records one read of an article. Bots are excluded on the same rule as business views, and previews are not
 * counted — a writer re-reading their own draft must never show up as readership.
 */
export async function countArticleView(articleId: string, ua: string | null) {
  if (isBotUA(ua)) return;
  const day = dayKey(new Date());
  await db.articleStat
    .upsert({ where: { articleId_day: { articleId, day } }, create: { articleId, day, views: 1 }, update: { views: { increment: 1 } } })
    .catch(() => {}); // a stats write must never take a page down
}

/** Reads of one article, for the editorial dashboards. */
export async function articleViews(articleId: string, days = 30): Promise<Series> {
  const since = dayKey(daysAgo(days - 1));
  const [rows, prev] = await Promise.all([
    db.articleStat.findMany({ where: { articleId, day: { gte: since } } }),
    db.articleStat.aggregate({ where: { articleId, day: { gte: dayKey(daysAgo(days * 2 - 1)), lt: since } }, _sum: { views: true } }),
  ]);
  return buildSeries(rows.map((r) => ({ day: r.day, value: r.views })), days, prev._sum.views ?? 0);
}
