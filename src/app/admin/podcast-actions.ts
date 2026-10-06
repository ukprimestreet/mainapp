"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { safeUrl, slugify } from "@/lib/business";
import { db } from "@/lib/db";
import { londonToDate } from "@/lib/editorial";
import { parseChapters, parseDuration, probeAudio, transcriptToInterview, validateEpisode, type EpisodeInput, type EpisodeIntent } from "@/lib/podcast";
import { createRedirect } from "@/lib/redirects";

export type EpState = { errors?: Record<string, string>; message?: string };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const audit = (action: string, targetType: string, targetId: string, detail?: string) => db.auditLog.create({ data: { action, targetType, targetId, detail } });

export async function probeAudioAction(url: string) { await requireAdmin(); return probeAudio(url.trim()); }

export async function saveEpisode(_: EpState, fd: FormData): Promise<EpState> {
  await requireAdmin();
  const id = s(fd, "id") || undefined;
  const intent = (s(fd, "intent") || "save") as EpisodeIntent;
  if (!["save", "publish", "schedule", "unpublish"].includes(intent)) return { message: "Unknown action" };
  const title = s(fd, "title");
  const input: EpisodeInput = {
    slug: s(fd, "slug") || slugify(title), number: parseInt(s(fd, "number"), 10), season: s(fd, "season") ? parseInt(s(fd, "season"), 10) : null,
    episodeType: s(fd, "episodeType") || "full", title, description: s(fd, "description"), showNotes: String(fd.get("showNotes") ?? "").replace(/\r\n/g, "\n").trim(),
    transcript: String(fd.get("transcript") ?? "").replace(/\r\n/g, "\n").trim(), chaptersText: String(fd.get("chaptersText") ?? "").replace(/\r\n/g, "\n").trim(),
    audioUrl: s(fd, "audioUrl"), audioBytes: s(fd, "audioBytes") ? parseInt(s(fd, "audioBytes"), 10) : null, audioMime: s(fd, "audioMime") || "audio/mpeg",
    videoUrl: s(fd, "videoUrl"), imageUrl: s(fd, "imageUrl"), durationText: s(fd, "durationText"), explicit: fd.get("explicit") === "on",
    guestName: s(fd, "guestName"), guestRole: s(fd, "guestRole"), businessId: s(fd, "businessId"), articleId: s(fd, "articleId"), publishedAt: s(fd, "publishedAt"),
  };
  const existing = id ? await db.podcastEpisode.findUnique({ where: { id } }) : null;
  if (id && !existing) return { message: "Episode not found" };
  const checkAs: EpisodeIntent = intent === "unpublish" ? "save" : intent === "save" && existing?.status === "PUBLISHED" ? "publish" : intent;
  const errors = await validateEpisode(input, checkAs, id);
  if (input.businessId && !(await db.business.findUnique({ where: { id: input.businessId } }))) errors.businessId = "Business not found";
  if (input.articleId) {
    const a = await db.article.findUnique({ where: { id: input.articleId }, include: { episode: true } });
    if (!a) errors.articleId = "Article not found"; else if (a.episode && a.episode.id !== id) errors.articleId = "That article is already linked to another episode";
  }
  if (intent === "schedule") {
    const d = input.publishedAt ? londonToDate(input.publishedAt) : null;
    if (!d) errors.publishedAt = "Choose a date and time to schedule"; else if (d.getTime() <= Date.now() + 60_000) errors.publishedAt = "Scheduled time must be in the future";
  }
  if (Object.keys(errors).length) return { errors, message: "Please fix the highlighted fields." };

  let status = existing?.status ?? "DRAFT", publishedAt = existing?.publishedAt ?? null;
  if (intent === "publish") { status = "PUBLISHED"; if (!publishedAt || publishedAt.getTime() > Date.now()) publishedAt = new Date(); }
  if (intent === "schedule") { status = "PUBLISHED"; publishedAt = londonToDate(input.publishedAt)!; }
  if (intent === "unpublish") { status = "DRAFT"; publishedAt = null; }
  const ch = input.chaptersText ? parseChapters(input.chaptersText) : null;
  const data = {
    slug: input.slug, number: input.number, season: input.season, episodeType: input.episodeType, title: input.title, description: input.description,
    showNotes: input.showNotes || null, transcript: input.transcript || null, chapters: ch && ch.ok ? JSON.stringify(ch.chapters) : null,
    audioUrl: input.audioUrl || null, audioBytes: input.audioUrl ? input.audioBytes : null, audioMime: input.audioMime, videoUrl: input.videoUrl || null, imageUrl: safeUrl(input.imageUrl),
    durationSec: input.durationText ? parseDuration(input.durationText) : null, explicit: input.explicit, guestName: input.guestName || null, guestRole: input.guestRole || null,
    businessId: input.businessId || null, status, publishedAt,
  };
  const ep = existing ? await db.podcastEpisode.update({ where: { id: existing.id }, data }) : await db.podcastEpisode.create({ data: { ...data, isSample: false } });
  // article link (unique both ways)
  await db.podcastEpisode.updateMany({ where: { articleId: input.articleId || "__none__", id: { not: ep.id } }, data: { articleId: null } });
  await db.podcastEpisode.update({ where: { id: ep.id }, data: { articleId: input.articleId || null } });
  if (existing && existing.status === "PUBLISHED" && !existing.isSample && existing.slug !== ep.slug) await createRedirect(`/podcast/${existing.slug}`, `/podcast/${ep.slug}`, "Episode URL changed");
  await audit(`EPISODE_${existing ? intent.toUpperCase() : "CREATE_" + intent.toUpperCase()}`, "PodcastEpisode", ep.id, ep.title);
  revalidatePath("/", "layout");
  redirect(`/admin/podcast/${ep.id}?msg=${encodeURIComponent({ save: "Saved", publish: "Published", schedule: "Scheduled", unpublish: "Unpublished — back to draft" }[intent])}`);
}

export async function deleteEpisode(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const e = await db.podcastEpisode.findUnique({ where: { id } });
  if (!e) redirect("/admin/podcast?msg=Not%20found");
  if (e.status === "PUBLISHED" && !e.isSample) redirect(`/admin/podcast/${id}?msg=${encodeURIComponent("Unpublish before deleting")}`);
  await db.podcastEpisode.delete({ where: { id } });
  await audit("EPISODE_DELETE", "PodcastEpisode", id, e.title);
  revalidatePath("/", "layout");
  redirect("/admin/podcast?msg=Deleted");
}

// ---------- quotes + clips ----------
const clipSchema = z.object({
  episodeId: z.string().min(1), kind: z.enum(["QUOTE", "CLIP"]),
  title: z.string().trim().max(100).optional(), quote: z.string().trim().max(280, "Quote is over 280 characters").optional(), speaker: z.string().trim().max(60).optional(),
  start: z.string().trim().optional(), end: z.string().trim().optional(), note: z.string().trim().max(300).optional(), url: z.string().trim().optional(),
});
export async function addClip(_: EpState, fd: FormData): Promise<EpState> {
  await requireAdmin();
  const p = clipSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) { const errors: Record<string, string> = {}; for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message; return { errors }; }
  const d = p.data;
  const errors: Record<string, string> = {};
  if (d.kind === "QUOTE" && (!d.quote || d.quote.length < 10)) errors.quote = "Enter the quote (at least 10 characters)";
  if (d.kind === "CLIP" && !d.title) errors.title = "Give the clip a title";
  const start = d.start ? parseDuration(d.start) : null, end = d.end ? parseDuration(d.end) : null;
  if (d.start && start === null) errors.start = "Use MM:SS or H:MM:SS";
  if (d.end && end === null) errors.end = "Use MM:SS or H:MM:SS";
  if (start !== null && end !== null && end <= start) errors.end = "End must be after start";
  if (d.kind === "CLIP" && (start === null || end === null)) errors.start = "A clip needs a start and an end time";
  if (d.url && !safeUrl(d.url)) errors.url = "Must be a valid http(s) address";
  if (Object.keys(errors).length) return { errors };
  if ((await db.episodeClip.count({ where: { episodeId: d.episodeId } })) >= 100) return { message: "Too many clips on this episode" };
  await db.episodeClip.create({ data: { episodeId: d.episodeId, kind: d.kind, title: d.title || null, quote: d.kind === "QUOTE" ? d.quote : null, speaker: d.speaker || null, startSec: start, endSec: end, note: d.note || null, url: safeUrl(d.url) } });
  revalidatePath("/", "layout");
  return { message: d.kind === "QUOTE" ? "Quote added — its share card is ready." : "Clip added to the editing list." };
}
export async function deleteClip(fd: FormData) {
  await requireAdmin();
  const c = await db.episodeClip.delete({ where: { id: s(fd, "id") } }).catch(() => null);
  revalidatePath("/", "layout");
  redirect(`/admin/podcast/${c?.episodeId ?? ""}?msg=${encodeURIComponent("Removed")}`);
}
export async function toggleClip(fd: FormData) {
  await requireAdmin();
  const c = await db.episodeClip.findUnique({ where: { id: s(fd, "id") } });
  if (c) await db.episodeClip.update({ where: { id: c.id }, data: { status: c.status === "DONE" ? "TODO" : "DONE" } });
  redirect(`/admin/podcast/${c?.episodeId ?? ""}`);
}

// ---------- written interview draft from the transcript ----------
export async function createInterviewDraft(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id"), authorId = s(fd, "authorId");
  const ep = await db.podcastEpisode.findUnique({ where: { id }, include: { business: true } });
  const back = (m: string): never => redirect(`/admin/podcast/${id}?msg=${encodeURIComponent(m)}`);
  if (!ep) return redirect("/admin/podcast");
  if (ep.articleId) return back("A written article is already linked to this episode");
  if (!ep.transcript || ep.transcript.trim().length < 200) return back("Add a transcript (200+ characters) first — the draft is built from it");
  if (!(await db.author.findUnique({ where: { id: authorId } }))) return back("Choose an author");
  let slug = slugify(ep.title.replace(/^inside the business:?\s*/i, "inside-the-business-")), n = 2;
  const base = slug;
  while (await db.article.findUnique({ where: { slug } })) slug = `${base}-${n++}`;
  const body = transcriptToInterview(ep.transcript, ep.guestName, `${ep.description}\n\n*This interview is also available as [a podcast episode](/podcast/${ep.slug}).*`);
  const article = await db.article.create({
    data: {
      slug, type: "INTERVIEW", disclosure: "EDITORIAL", title: ep.title, standfirst: ep.description.slice(0, 220), body, status: "DRAFT", isSample: false, authorId,
      imageUrl: safeUrl(ep.imageUrl), businesses: ep.businessId ? { create: [{ businessId: ep.businessId }] } : undefined,
    },
  });
  await db.podcastEpisode.update({ where: { id }, data: { articleId: article.id } });
  await audit("EPISODE_ARTICLE_DRAFT", "PodcastEpisode", id, article.id);
  redirect(`/admin/articles/${article.id}?msg=${encodeURIComponent("Draft created from the transcript — edit and publish when ready")}`);
}

// ---------- show settings ----------
const showSchema = z.object({
  title: z.string().trim().min(3).max(100), description: z.string().trim().min(20, "Describe the show in at least 20 characters").max(1000), author: z.string().trim().min(2).max(100),
  ownerEmail: z.string().trim().email("Enter a valid email address").or(z.literal("")), language: z.string().trim().regex(/^[a-z]{2}(-[a-z]{2})?$/i, "e.g. en-gb"),
  category: z.string().trim().min(2).max(60), copyright: z.string().trim().max(120).optional(),
});
export async function saveShow(_: EpState, fd: FormData): Promise<EpState> {
  await requireAdmin();
  const p = showSchema.safeParse(Object.fromEntries(fd));
  const errors: Record<string, string> = {};
  if (!p.success) for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message;
  const urls: Record<string, string | null> = {};
  for (const k of ["imageUrl", "spotifyUrl", "appleUrl", "youtubeUrl"]) { const v = s(fd, k); if (!v) urls[k] = null; else { const u = safeUrl(v); if (!u) errors[k] = "Must be a valid http(s) address"; else urls[k] = u; } }
  if (Object.keys(errors).length || !p.success) return { errors, message: "Please fix the highlighted fields." };
  const d = p.data;
  await db.podcastShow.upsert({ where: { id: "main" }, create: { id: "main", ...d, copyright: d.copyright ?? "", explicit: fd.get("explicit") === "on", ...urls }, update: { ...d, copyright: d.copyright ?? "", explicit: fd.get("explicit") === "on", ...urls } });
  await audit("PODCAST_SHOW_SAVED", "PodcastShow", "main");
  revalidatePath("/", "layout");
  return { message: "Saved. The RSS feed and podcast page use these settings immediately." };
}
