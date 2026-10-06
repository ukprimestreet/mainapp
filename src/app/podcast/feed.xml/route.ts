import { db } from "@/lib/db";
import { etagOf, getShow, rssXml } from "@/lib/podcast";

export const dynamic = "force-dynamic";

/** Podcast RSS for Apple Podcasts / Spotify / etc. Real, published episodes with a complete audio enclosure only. */
export async function GET(req: Request) {
  const [show, eps] = await Promise.all([
    getShow(),
    db.podcastEpisode.findMany({ where: { status: "PUBLISHED", isSample: false, publishedAt: { lte: new Date() }, audioUrl: { not: null }, audioBytes: { not: null } }, orderBy: { publishedAt: "desc" } }),
  ]);
  const body = rssXml(show, eps);
  const etag = etagOf(body);
  const headers = { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
}
