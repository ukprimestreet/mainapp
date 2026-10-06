import { db } from "@/lib/db";
import { dateToLondonInput } from "@/lib/editorial";
import { chaptersToText, fmtDuration, readChapters } from "@/lib/podcast-shared";
import type { EpData } from "./EpisodeEditor";

export async function episodeProps(episodeId?: string) {
  const ep = episodeId ? await db.podcastEpisode.findUnique({ where: { id: episodeId }, include: { business: true } }) : null;
  if (episodeId && !ep) return null;
  const [arts, last] = await Promise.all([
    db.article.findMany({ where: { OR: [{ episode: null }, ...(ep?.articleId ? [{ id: ep.articleId }] : [])] }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.podcastEpisode.findFirst({ orderBy: { number: "desc" } }),
  ]);
  const initial: EpData = ep
    ? {
        id: ep.id, slug: ep.slug, number: String(ep.number), season: ep.season ? String(ep.season) : "", episodeType: ep.episodeType, title: ep.title, description: ep.description, showNotes: ep.showNotes ?? "",
        transcript: ep.transcript ?? "", chaptersText: chaptersToText(readChapters(ep.chapters)), audioUrl: ep.audioUrl ?? "", audioBytes: ep.audioBytes ? String(ep.audioBytes) : "", audioMime: ep.audioMime,
        videoUrl: ep.videoUrl ?? "", imageUrl: ep.imageUrl ?? "", durationText: ep.durationSec ? fmtDuration(ep.durationSec) : "", explicit: ep.explicit, guestName: ep.guestName ?? "", guestRole: ep.guestRole ?? "",
        businessId: ep.businessId ?? "", businessName: ep.business?.name ?? "", articleId: ep.articleId ?? "",
        publishedAt: dateToLondonInput(ep.publishedAt && ep.publishedAt.getTime() > Date.now() ? ep.publishedAt : null), status: ep.status, scheduled: ep.status === "PUBLISHED" && !!ep.publishedAt && ep.publishedAt.getTime() > Date.now(),
      }
    : { slug: "", number: String((last?.number ?? 0) + 1), season: "", episodeType: "full", title: "", description: "", showNotes: "", transcript: "", chaptersText: "", audioUrl: "", audioBytes: "", audioMime: "audio/mpeg", videoUrl: "", imageUrl: "", durationText: "", explicit: false, guestName: "", guestRole: "", businessId: "", businessName: "", articleId: "", publishedAt: "", status: "DRAFT", scheduled: false };
  return { initial, articles: arts.map((a) => ({ id: a.id, name: a.title })), ep };
}
