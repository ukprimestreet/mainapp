import Link from "next/link";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { fmtDuration } from "@/lib/podcast-shared";

export default async function PodcastAdmin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const now = new Date();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const eps = await db.podcastEpisode.findMany({ orderBy: [{ number: "desc" }], include: { stats: { where: { day: { gte: since } } }, _count: { select: { plays: { where: { day: { gte: since } } } } } } });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">Podcast &amp; video</h1>
        <div className="flex gap-2"><Link href="/admin/podcast/new" className="inline-flex min-h-11 items-center rounded-full bg-yellow px-5 font-bold">+ New episode</Link><Link href="/admin/podcast/show" className="inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 font-bold">Show settings</Link></div></div>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <p className="mb-4 text-sm text-grey">RSS feed for podcast apps: <a className="font-bold underline" href="/podcast/feed.xml">/podcast/feed.xml</a></p>
      {eps.length === 0 ? <p className="text-grey">No episodes yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">#</th><th>Title</th><th>Status</th><th>Media</th><th>Duration</th><th>Views (30d)</th><th>Plays (30d)</th></tr></thead>
          <tbody>{eps.map((e) => (
            <tr key={e.id} className="border-b border-line align-top"><td className="py-2">{e.season ? `S${e.season} ` : ""}{e.number}</td>
              <td className="font-bold"><Link className="underline" href={`/admin/podcast/${e.id}`}>{e.title}</Link>{e.isSample && <span className="ml-2 text-xs text-grey">sample</span>}</td>
              <td>{e.status === "DRAFT" ? "Draft" : e.publishedAt && e.publishedAt > now ? `Scheduled ${fmtDate(e.publishedAt)}` : "Live"}</td>
              <td>{[e.audioUrl && "Audio", e.videoUrl && "Video", e.transcript && "Transcript"].filter(Boolean).join(" · ") || "—"}</td><td>{fmtDuration(e.durationSec) || "—"}</td>
              <td>{e.stats.reduce((a, b) => a + b.views, 0)}</td><td>{e._count.plays}</td></tr>))}</tbody></table></div>
      )}
    </>
  );
}
