import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Plain-text transcript, referenced from the RSS feed (<podcast:transcript>). Published real episodes only. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const e = await db.podcastEpisode.findFirst({ where: { slug: (await params).slug, status: "PUBLISHED", isSample: false, publishedAt: { lte: new Date() } } });
  if (!e?.transcript) return new Response("Not found", { status: 404 });
  return new Response(`${e.title}\n${"=".repeat(Math.min(e.title.length, 80))}\n\n${e.transcript}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
