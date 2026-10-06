import { createHash } from "crypto";
import { SITE } from "./constants";
import { safeUrl, slugify } from "./business";
import { db } from "./db";

import { AUDIO_MIMES, isPrivateHost, parseChapters, parseDuration, parseVideoUrl, readChapters, validAudioUrl } from "./podcast-shared";
export * from "./podcast-shared";

/**
 * HEAD the audio file to learn its size and type (needed for the RSS enclosure). Admin-triggered only.
 * Guards: https only, no private hosts (checked on every redirect hop), 8 s timeout, no body is ever read.
 * (Loopback is allowed outside production so the feature can be exercised locally.)
 */
export async function probeAudio(url: string): Promise<{ ok: true; bytes: number; mime: string } | { ok: false; error: string }> {
  const dev = process.env.NODE_ENV !== "production";
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try { u = new URL(cur); } catch { return { ok: false, error: "Not a valid URL" }; }
    const loop = dev && ["localhost", "127.0.0.1"].includes(u.hostname);
    if (!loop && (u.protocol !== "https:" || isPrivateHost(u.hostname))) return { ok: false, error: "Audio must be on a public https address" };
    let r: Response;
    try { r = await fetch(u, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) }); } catch { return { ok: false, error: "Couldn't reach that file (timeout or network error)" }; }
    if ([301, 302, 303, 307, 308].includes(r.status)) { const loc = r.headers.get("location"); if (!loc) return { ok: false, error: "Bad redirect" }; cur = new URL(loc, u).toString(); continue; }
    if (!r.ok) return { ok: false, error: `The file returned HTTP ${r.status}` };
    const bytes = Number(r.headers.get("content-length") ?? 0);
    const mime = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!bytes) return { ok: false, error: "The server didn't report a file size (Content-Length)" };
    if (!(AUDIO_MIMES as readonly string[]).includes(mime)) return { ok: false, error: `Unsupported type “${mime || "unknown"}” — use MP3 or M4A` };
    return { ok: true, bytes, mime };
  }
  return { ok: false, error: "Too many redirects" };
}

// ---------------------------------------------------------------- validation
export type EpisodeInput = {
  slug: string; number: number; season: number | null; episodeType: string; title: string; description: string; showNotes: string; transcript: string;
  chaptersText: string; audioUrl: string; audioBytes: number | null; audioMime: string; videoUrl: string; imageUrl: string; durationText: string;
  explicit: boolean; guestName: string; guestRole: string; businessId: string; articleId: string; publishedAt: string;
};
export type EpisodeIntent = "save" | "publish" | "schedule" | "unpublish";

export async function validateEpisode(e: EpisodeInput, intent: EpisodeIntent, selfId?: string): Promise<Record<string, string>> {
  const err: Record<string, string> = {};
  if (e.title.trim().length < 5 || e.title.length > 120) err.title = "Title must be 5–120 characters";
  if (!e.slug || e.slug !== slugify(e.slug)) err.slug = "Slug may only contain lowercase letters, numbers and hyphens";
  else { const c = await db.podcastEpisode.findUnique({ where: { slug: e.slug } }); if (c && c.id !== selfId) err.slug = "That slug is already used by another episode"; }
  if (!Number.isInteger(e.number) || e.number < 1 || e.number > 9999) err.number = "Episode number must be 1 or more";
  else { const c = await db.podcastEpisode.findFirst({ where: { number: e.number, season: e.season, NOT: selfId ? { id: selfId } : undefined } }); if (c) err.number = `Episode ${e.number}${e.season ? ` of season ${e.season}` : ""} already exists`; }
  if (!["full", "trailer", "bonus"].includes(e.episodeType)) err.episodeType = "Choose full, trailer or bonus";
  if (e.description.length > 400) err.description = "Description is over 400 characters";
  if (e.audioUrl && !validAudioUrl(e.audioUrl)) err.audioUrl = "Audio must be a public https link to an MP3/M4A file";
  if (e.audioUrl && !(AUDIO_MIMES as readonly string[]).includes(e.audioMime)) err.audioMime = "Unsupported audio type";
  if (e.videoUrl && !parseVideoUrl(e.videoUrl)) err.videoUrl = "Use a YouTube or Vimeo link, or a direct https .mp4/.webm file";
  if (e.imageUrl && !safeUrl(e.imageUrl)) err.imageUrl = "Image must be a valid http(s) address";
  if (e.durationText && parseDuration(e.durationText) === null) err.durationText = "Use H:MM:SS, MM:SS or seconds";
  if (e.audioBytes != null && (!Number.isInteger(e.audioBytes) || e.audioBytes < 1)) err.audioBytes = "File size must be a positive whole number of bytes";
  if (e.chaptersText.trim()) { const c = parseChapters(e.chaptersText); if (!c.ok) err.chaptersText = c.error; }
  if (e.transcript.length > 200_000) err.transcript = "Transcript is too long (200,000 characters max)";
  if (e.showNotes.length > 20_000) err.showNotes = "Show notes are over 20,000 characters";
  if (intent === "publish" || intent === "schedule") {
    if (e.description.trim().length < 50) err.description ||= "Description must be at least 50 characters to publish";
    if (!e.audioUrl && !e.videoUrl) err.audioUrl ||= "Add an audio file or a video link to publish";
    if (e.audioUrl && !e.durationText) err.durationText ||= "Duration is needed for podcast apps";
    if (e.audioUrl && !e.audioBytes) err.audioBytes ||= "File size is needed for podcast apps — use “Check file” to fill it in";
  }
  return err;
}

// ---------------------------------------------------------------- RSS
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
type Show = { title: string; description: string; author: string; ownerEmail: string; imageUrl: string | null; language: string; category: string; explicit: boolean; copyright: string };
type Ep = { slug: string; number: number; season: number | null; episodeType: string; title: string; description: string; audioUrl: string | null; audioBytes: number | null; audioMime: string; durationSec: number | null; explicit: boolean; imageUrl: string | null; publishedAt: Date | null; transcript: string | null; chapters: string | null; guestName: string | null };

/** Podcast RSS 2.0 with iTunes + Podcasting 2.0 tags. Only episodes with audio that is complete enough for Apple/Spotify. */
export function rssXml(show: Show, eps: Ep[], site = SITE.url): string {
  const items = eps.filter((e) => e.audioUrl && e.audioBytes && e.publishedAt).map((e) => {
    const url = `${site}/podcast/${e.slug}`;
    const hasCh = readChapters(e.chapters).length > 0;
    return `<item>
<title>${esc(e.title)}</title>
<link>${url}</link>
<guid isPermaLink="false">primestreet-ep-${esc(e.slug)}</guid>
<pubDate>${e.publishedAt!.toUTCString()}</pubDate>
<description>${esc(e.description)}</description>
<enclosure url="${esc(e.audioUrl!)}" length="${e.audioBytes}" type="${esc(e.audioMime)}"/>
${e.durationSec ? `<itunes:duration>${e.durationSec}</itunes:duration>\n` : ""}<itunes:episode>${e.number}</itunes:episode>
${e.season ? `<itunes:season>${e.season}</itunes:season>\n` : ""}<itunes:episodeType>${esc(e.episodeType)}</itunes:episodeType>
<itunes:explicit>${e.explicit ? "true" : "false"}</itunes:explicit>
${e.imageUrl ? `<itunes:image href="${esc(e.imageUrl)}"/>\n` : ""}${e.transcript ? `<podcast:transcript url="${url}/transcript.txt" type="text/plain"/>\n` : ""}${hasCh ? `<podcast:chapters url="${url}/chapters.json" type="application/json+chapters"/>\n` : ""}</item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel>
<title>${esc(show.title)}</title>
<link>${site}/podcast</link>
<atom:link href="${site}/podcast/feed.xml" rel="self" type="application/rss+xml"/>
<description>${esc(show.description)}</description>
<language>${esc(show.language)}</language>
${show.copyright ? `<copyright>${esc(show.copyright)}</copyright>\n` : ""}<itunes:author>${esc(show.author)}</itunes:author>
<itunes:summary>${esc(show.description)}</itunes:summary>
<itunes:explicit>${show.explicit ? "true" : "false"}</itunes:explicit>
<itunes:type>episodic</itunes:type>
${show.imageUrl ? `<itunes:image href="${esc(show.imageUrl)}"/>\n<image><url>${esc(show.imageUrl)}</url><title>${esc(show.title)}</title><link>${site}/podcast</link></image>\n` : ""}<itunes:category text="${esc(show.category)}"/>
${show.ownerEmail ? `<itunes:owner><itunes:name>${esc(show.author)}</itunes:name><itunes:email>${esc(show.ownerEmail)}</itunes:email></itunes:owner>\n` : ""}${items.join("\n")}
</channel>
</rss>`;
}
export const etagOf = (body: string) => `"${createHash("sha1").update(body).digest("hex").slice(0, 20)}"`;

// ---------------------------------------------------------------- repurposing
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
export type Turn = { speaker: string; text: string };
export function parseTranscript(t: string): Turn[] {
  const turns: Turn[] = [];
  for (const raw of t.split(/\n{1,}/).map((l) => l.trim()).filter(Boolean)) {
    const m = raw.match(/^(?:\[[\d:]+\]\s*)?\*{0,2}([A-Z][\w .'’-]{0,40}?):\*{0,2}\s+(.+)$/);
    if (m) turns.push({ speaker: m[1].trim(), text: m[2].trim() });
    else if (turns.length) turns[turns.length - 1].text += " " + raw;
    else turns.push({ speaker: "", text: raw });
  }
  return turns;
}
/** Turns a labelled transcript into a written Q&A interview body (host turns → ## questions, guest turns → answers). */
export function transcriptToInterview(transcript: string, guestName: string | null, intro: string): string {
  const turns = parseTranscript(transcript);
  const guestKey = guestName ? norm(guestName).slice(0, 4) : "";
  const isGuest = (sp: string) => !!sp && !!guestKey && (norm(sp).includes(guestKey) || guestKey.includes(norm(sp).slice(0, 4)) && norm(sp).length >= 3);
  const out: string[] = [intro.trim()];
  for (const t of turns) {
    if (!isGuest(t.speaker) && t.speaker) {
      const q = t.text.length > 180 ? t.text.slice(0, 177).replace(/\s+\S*$/, "") + "…" : t.text;
      out.push(`## ${q.replace(/^#+\s*/, "")}`);
    } else { out.push(t.text); }
  }
  return out.filter(Boolean).join("\n\n");
}

export function copyKit(o: { title: string; description: string; guestName?: string | null; businessName?: string | null; url: string; hasVideo: boolean }) {
  const who = o.guestName ? ` with ${o.guestName}` : "";
  const biz = o.businessName ? ` of ${o.businessName}` : "";
  return {
    newsletter: `**New on the PrimeStreet Podcast${who}**\n\n${o.title}\n\n${o.description}\n\n${o.hasVideo ? "Watch or listen" : "Listen"}: ${o.url}`,
    captions: [
      `New episode${who}: ${o.title}. ${o.hasVideo ? "Watch or listen" : "Listen"} → ${o.url}`,
      `How does a London business really get built? ${o.guestName ? o.guestName + biz + " tells the story" : "We ask the founder"}. ${o.url}`,
      `${o.description.split(/(?<=[.!?])\s/)[0]} Full conversation on The PrimeStreet Podcast → ${o.url}`,
    ].map((c) => c.slice(0, 280)),
  };
}

export async function getShow() {
  // upsert (not find-then-create): parallel renders must not race to create the singleton row
  return db.podcastShow.upsert({ where: { id: "main" }, create: { id: "main" }, update: {} });
}
const today = () => new Date().toISOString().slice(0, 10);
export async function countEpisodeView(episodeId: string, ua: string | null) {
  if (!ua || /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python|axios|node-fetch|go-http/i.test(ua)) return;
  const day = today();
  await db.episodeStat.upsert({ where: { episodeId_day: { episodeId, day } }, create: { episodeId, day, views: 1 }, update: { views: { increment: 1 } } }).catch(() => {});
}
