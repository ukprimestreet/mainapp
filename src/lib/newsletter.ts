import { createHmac, timingSafeEqual } from "crypto";
import { SITE, ARTICLE_TYPES, type ArticleType } from "./constants";
import { db } from "./db";
import { fmtDuration } from "./podcast-shared";

export const SEND_LIMIT = 500; // recipients per issue until a send queue exists
const secret = () => process.env.SESSION_SECRET || "dev-only-secret";
/** Stateless unsubscribe token: the subscriber id + an HMAC. Works from any email without a login and can't be guessed. */
export function unsubToken(subscriberId: string) {
  return `${subscriberId}.${createHmac("sha256", secret()).update(`unsub:${subscriberId}`).digest("base64url").slice(0, 22)}`;
}
export function readUnsubToken(token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  const expected = createHmac("sha256", secret()).update(`unsub:${id}`).digest("base64url").slice(0, 22);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? id : null;
}
export const unsubUrl = (subscriberId: string) => `${SITE.url}/newsletter/unsubscribe/${unsubToken(subscriberId)}`;

/** CSV cell safe against spreadsheet formula injection. */
export const csvCell = (v: string) => { const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export type Digest = { subject: string; body: string; counts: { articles: number; episodes: number; businesses: number } };

/**
 * Builds the weekly digest from REAL content only (no sample data), published in the last `days` days:
 * stories, the latest podcast episode and newly added businesses. Returns null when there is nothing worth sending.
 */
export async function buildDigest(days = 7, now = new Date()): Promise<Digest | null> {
  const since = new Date(now.getTime() - days * 86400_000);
  const [articles, episodes, businesses] = await Promise.all([
    db.article.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { gte: since, lte: now } }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 5, include: { location: true } }),
    db.podcastEpisode.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { gte: since, lte: now } }, orderBy: { publishedAt: "desc" }, take: 1 }),
    db.business.findMany({ where: { published: true, isSample: false, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 5, include: { category: true, location: true, city: true } }),
  ]);
  if (!articles.length && !episodes.length && !businesses.length) return null;
  const sponsors = await db.sponsorship.findMany({ where: { kind: "NEWSLETTER", status: "ACTIVE", OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } });
  const lines: string[] = ["Hello,", "", "Here's what's new on PrimeStreet this week.", ""];
  if (articles.length) {
    lines.push("STORIES", "-------");
    for (const a of articles) lines.push(`${a.title}${a.disclosure !== "EDITORIAL" ? ` [${a.disclosure}]` : ""}`, a.standfirst, `${SITE.url}/${ARTICLE_TYPES[a.type as ArticleType].path}/${a.slug}`, "");
  }
  if (episodes.length) { const e = episodes[0]; lines.push("PODCAST", "-------", `Episode ${e.number}: ${e.title}${e.durationSec ? ` (${fmtDuration(e.durationSec)})` : ""}`, e.description, `${SITE.url}/podcast/${e.slug}`, ""); }
  if (businesses.length) { lines.push("NEW IN THE DIRECTORY", "--------------------"); for (const b of businesses) lines.push(`${b.name} — ${b.category.name}, ${b.location.name}`, `${SITE.url}/businesses/${b.city.slug}/${b.category.slug}/${b.slug}`); lines.push(""); }
  for (const sp of sponsors) lines.push("SPONSORED", "---------", `This week's newsletter is sponsored by ${sp.sponsorName}.${sp.notes ? " " + sp.notes : ""}${sp.website ? " " + sp.website : ""}`, "(Sponsors don't influence what we cover.)", "");
  lines.push("Own a London business? Claim your free profile: " + SITE.url + "/claim", "", "{{unsubscribe}}");
  const lead = articles[0]?.title ?? episodes[0]?.title ?? businesses[0]?.name ?? "this week";
  return { subject: `PrimeStreet weekly: ${lead}`.slice(0, 120), body: lines.join("\n"), counts: { articles: articles.length, episodes: episodes.length, businesses: businesses.length } };
}

export const FOOTER = () => process.env.NEWSLETTER_FOOTER || "PrimeStreet · London · You're receiving this because you subscribed at primestreet.uk.";
/** Final text for one recipient: placeholder replaced with their personal unsubscribe link + sender footer. */
export const renderForRecipient = (body: string, subscriberId: string) => body.replace("{{unsubscribe}}", `${FOOTER()}\nUnsubscribe in one click: ${unsubUrl(subscriberId)}`);
