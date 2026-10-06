import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ogCard } from "@/lib/og";

export const dynamic = "force-dynamic";

/** Branded shareable quote card (1200×630 PNG). Public once the episode is live; admins can preview drafts. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; clip: string }> }) {
  const { slug, clip } = await params;
  const c = await db.episodeClip.findFirst({ where: { id: clip, kind: "QUOTE", episode: { slug } }, include: { episode: true } });
  const live = c && c.episode.status === "PUBLISHED" && c.episode.publishedAt && c.episode.publishedAt.getTime() <= Date.now();
  if (!c || !c.quote || (!live && !(await isAdmin()))) return new Response("Not found", { status: 404 });
  return ogCard({ kicker: `Episode ${c.episode.number}`, title: `“${c.quote}”`, sub: [c.speaker && `— ${c.speaker}`, c.episode.guestRole].filter(Boolean).join(", ") || undefined, max: 200 });
}
