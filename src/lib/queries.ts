import { db } from "./db";
import { ARTICLE_TYPES, type ArticleType } from "./constants";

export const businessInclude = { category: true, location: true, city: true } as const;

export const bizPath = (b: { slug: string; city: { slug: string }; category: { slug: string } }) =>
  `/businesses/${b.city.slug}/${b.category.slug}/${b.slug}`;

export const articlePath = (a: { type: string; slug: string }) =>
  `/${ARTICLE_TYPES[a.type as ArticleType].path}/${a.slug}`;

const live = { status: "PUBLISHED", publishedAt: { lte: new Date() } } as const;

export const latestArticles = (type?: string, take = 12, extra: object = {}) =>
  db.article.findMany({ where: { ...live, ...(type ? { type } : {}), ...extra }, orderBy: { publishedAt: "desc" }, take, include: { author: true, location: { include: { city: true } } } });

export const parseJson = <T,>(s: string | null | undefined, fallback: T): T => {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
};
