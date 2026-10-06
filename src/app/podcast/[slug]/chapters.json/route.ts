import { db } from "@/lib/db";
import { readChapters } from "@/lib/podcast-shared";

export const dynamic = "force-dynamic";

/** Podcasting 2.0 chapters (https://github.com/Podcastindex-org/podcast-namespace/blob/main/chapters/jsonChapters.md). */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const e = await db.podcastEpisode.findFirst({ where: { slug: (await params).slug, status: "PUBLISHED", isSample: false, publishedAt: { lte: new Date() } } });
  const ch = e ? readChapters(e.chapters) : [];
  if (!ch.length) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify({ version: "1.2.0", title: e!.title, chapters: ch.map((c) => ({ startTime: c.t, title: c.title })) }), { headers: { "Content-Type": "application/json+chapters; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
