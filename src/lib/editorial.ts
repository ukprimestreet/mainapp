import { ARTICLE_TYPES, DISCLOSURE, type ArticleType } from "./constants";
import { safeUrl, slugify } from "./business";
import { db } from "./db";

export const readingMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));

const TZ = "Europe/London";
/** "2026-10-12T09:30" entered in London time -> UTC Date. */
export function londonToDate(local: string): Date | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
    const g = (k: string) => Number(parts.find((p) => p.type === k)!.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - t;
  };
  const first = guess - offset(guess);
  const date = new Date(guess - offset(first));
  return isNaN(date.getTime()) ? null : date;
}
export function dateToLondonInput(d: Date | null | undefined): string {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (k: string) => p.find((x) => x.type === k)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

export type ArticleInput = {
  type: string; disclosure: string; title: string; slug: string; standfirst: string; body: string;
  imageUrl?: string; imageAlt?: string; imageCredit?: string; sponsorName?: string;
  seoTitle?: string; seoDescription?: string; authorId: string; locationId?: string; featured?: boolean;
  businessIds: string[]; publishedAt?: string;
};
export type Intent = "save" | "publish" | "schedule" | "unpublish";

/** Drafts can be saved nearly empty. Publishing/scheduling enforces the editorial-integrity rules. */
export async function validateArticle(a: ArticleInput, intent: Intent, selfId?: string): Promise<Record<string, string>> {
  const e: Record<string, string> = {};
  if (!(a.type in ARTICLE_TYPES)) e.type = "Choose a content type";
  if (!(a.disclosure in DISCLOSURE)) e.disclosure = "Choose a disclosure level";
  if (a.title.trim().length < 5) e.title = "Title is required (at least 5 characters)";
  if (a.title.length > 120) e.title = "Title is over 120 characters";
  if (!a.slug || a.slug !== slugify(a.slug)) e.slug = "Slug may only contain lowercase letters, numbers and hyphens";
  else {
    const clash = await db.article.findUnique({ where: { slug: a.slug } });
    if (clash && clash.id !== selfId) e.slug = "That slug is already used by another article";
  }
  if (!a.authorId) e.authorId = "Choose an author";
  if (a.imageUrl && !safeUrl(a.imageUrl)) e.imageUrl = "Image must be a valid http(s) URL";
  if (a.seoTitle && a.seoTitle.length > 70) e.seoTitle = "SEO title is over 70 characters";
  if (a.seoDescription && a.seoDescription.length > 160) e.seoDescription = "Meta description is over 160 characters";
  if (a.disclosure !== "EDITORIAL" && !a.sponsorName?.trim()) e.sponsorName = "Name the sponsor/partner — it is shown to readers";

  if (intent === "publish" || intent === "schedule") {
    if (a.standfirst.trim().length < 30) e.standfirst ||= "Standfirst must be at least 30 characters to publish";
    if (a.standfirst.length > 220) e.standfirst ||= "Standfirst is over 220 characters";
    if (a.body.trim().length < 300) e.body = "Body must be at least 300 characters to publish";
    if (a.imageUrl && !a.imageAlt?.trim()) e.imageAlt = "Describe the image (alt text) to publish";
    if (a.type === "BOTW" && a.disclosure !== "EDITORIAL") e.disclosure = "Business of the Week is always editorial and can't be sponsored";
    if ((a.type === "BOTW" || a.type === "INTERVIEW") && a.businessIds.length === 0) e.businessIds = `${ARTICLE_TYPES[a.type as ArticleType]?.label} must link at least one business`;
  }
  if (intent === "schedule") {
    const d = a.publishedAt ? londonToDate(a.publishedAt) : null;
    if (!d) e.publishedAt = "Choose a date and time to schedule";
    else if (d.getTime() <= Date.now() + 60_000) e.publishedAt = "Scheduled time must be in the future";
  }
  return e;
}

/** Editorial-balance check: what share of recent published pieces feature founder-owned businesses? */
export async function founderShare(window = 20) {
  const recent = await db.article.findMany({
    where: { status: "PUBLISHED", publishedAt: { lte: new Date() }, isSample: false }, orderBy: { publishedAt: "desc" }, take: window,
    include: { businesses: { include: { business: { select: { ownedByFounder: true } } } } },
  });
  const founder = recent.filter((a) => a.businesses.some((b) => b.business.ownedByFounder)).length;
  return { total: recent.length, founder, share: recent.length ? founder / recent.length : 0 };
}
export const FOUNDER_SHARE_LIMIT = 0.25;
