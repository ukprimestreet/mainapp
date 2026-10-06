import { SITE } from "@/lib/constants";
import { db } from "@/lib/db";
import { articlePath } from "@/lib/queries";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

/** RSS 2.0 of real (non-sample) published editorial. Sponsored pieces are labelled in the title. */
export async function GET() {
  const items = await db.article.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" }, take: 30, include: { author: true } });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${SITE.name}</title><link>${SITE.url}</link><description>${esc(SITE.description)}</description><language>en-gb</language>
<atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml"/>
${items.map((a) => `<item><title>${esc((a.disclosure === "EDITORIAL" ? "" : `[${a.disclosure}] `) + a.title)}</title><link>${SITE.url}${articlePath(a)}</link><guid isPermaLink="true">${SITE.url}${articlePath(a)}</guid><pubDate>${a.publishedAt!.toUTCString()}</pubDate><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${esc(a.author.name)}</dc:creator><description>${esc(a.standfirst)}</description></item>`).join("\n")}
</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
