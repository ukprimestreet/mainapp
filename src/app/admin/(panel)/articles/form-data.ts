import { ARTICLE_TYPES, DISCLOSURE } from "@/lib/constants";
import { db } from "@/lib/db";
import { dateToLondonInput } from "@/lib/editorial";
import type { EditorData } from "./ArticleEditor";

export async function editorProps(articleId?: string, presetType?: string) {
  const [authors, locations, article] = await Promise.all([
    db.author.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
    articleId ? db.article.findUnique({ where: { id: articleId }, include: { businesses: { include: { business: { include: { category: true, location: true } } } }, episode: true } }) : null,
  ]);
  if (articleId && !article) return null;
  const episodes = await db.podcastEpisode.findMany({ where: { OR: [{ articleId: null }, ...(articleId ? [{ articleId }] : [])] }, orderBy: { number: "desc" } });
  const initial: EditorData = article
    ? {
        id: article.id, type: article.type, disclosure: article.disclosure, title: article.title, slug: article.slug, standfirst: article.standfirst, body: article.body,
        imageUrl: article.imageUrl ?? "", imageAlt: article.imageAlt ?? "", imageCredit: article.imageCredit ?? "", sponsorName: article.sponsorName ?? "",
        seoTitle: article.seoTitle ?? "", seoDescription: article.seoDescription ?? "", authorId: article.authorId, locationId: article.locationId ?? "",
        featured: article.featured, publishedAt: dateToLondonInput(article.publishedAt && article.publishedAt.getTime() > Date.now() ? article.publishedAt : null),
        episodeId: article.episode?.id ?? "", status: article.status, scheduled: article.status === "PUBLISHED" && !!article.publishedAt && article.publishedAt.getTime() > Date.now(),
        businesses: article.businesses.map((x) => ({ id: x.business.id, name: x.business.name, meta: `${x.business.category.name} · ${x.business.location.name}`, founder: x.business.ownedByFounder })),
      }
    : {
        type: presetType && presetType in ARTICLE_TYPES ? presetType : "", disclosure: "EDITORIAL", title: "", slug: "", standfirst: "", body: "", imageUrl: "", imageAlt: "", imageCredit: "",
        sponsorName: "", seoTitle: "", seoDescription: "", authorId: authors[0]?.id ?? "", locationId: "", featured: false, publishedAt: "", episodeId: "", status: "DRAFT", scheduled: false, businesses: [],
      };
  return {
    initial,
    types: Object.entries(ARTICLE_TYPES).map(([key, v]) => ({ key, label: v.label })),
    disclosures: Object.entries(DISCLOSURE).map(([key, v]) => ({ key, label: v.label })),
    authors: authors.map((a) => ({ id: a.id, name: a.name })),
    locations: locations.map((a) => ({ id: a.id, name: a.name })),
    episodes: episodes.map((e) => ({ id: e.id, name: `#${e.number} ${e.title}` })),
  };
}
