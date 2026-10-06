import { NextResponse } from "next/server";
import { ipHash, sha256 } from "@/lib/antispam";
import { db } from "@/lib/db";
import { isBotUA } from "@/lib/owner";

export const dynamic = "force-dynamic";

/**
 * Play beacon. One deduplicated play per (anonymous visitor, episode, day): the key is a salted hash of IP + episode + day,
 * so we count listeners without storing who they are. Same-origin only; bots ignored; always answers 204.
 */
export async function POST(req: Request) {
  const done = new NextResponse(null, { status: 204 });
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(req.url).host && new URL(origin).host !== req.headers.get("host")) return done;
    if (isBotUA(req.headers.get("user-agent"))) return done;
    const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
    if (!body || typeof body.slug !== "string") return done;
    const ep = await db.podcastEpisode.findFirst({ where: { slug: body.slug, status: "PUBLISHED", publishedAt: { lte: new Date() } } });
    if (!ep) return done;
    const day = new Date().toISOString().slice(0, 10);
    const key = sha256(`${await ipHash()}|${ep.id}|${day}`);
    await db.episodePlay.create({ data: { episodeId: ep.id, day, key } }).catch(() => {}); // unique key → duplicates silently ignored
  } catch { /* never fail the player */ }
  return done;
}
