"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { fmtDuration, parseChapters, parseDuration, parseVideoUrl } from "@/lib/podcast-shared";
import { probeAudioAction, saveEpisode, type EpState } from "../../podcast-actions";

export type EpData = {
  id?: string; slug: string; number: string; season: string; episodeType: string; title: string; description: string; showNotes: string; transcript: string; chaptersText: string;
  audioUrl: string; audioBytes: string; audioMime: string; videoUrl: string; imageUrl: string; durationText: string; explicit: boolean; guestName: string; guestRole: string;
  businessId: string; businessName: string; articleId: string; publishedAt: string; status: string; scheduled: boolean;
};
type Opt = { id: string; name: string };
const field = "min-h-11 w-full rounded-lg border-2 border-line bg-white px-3 py-2";
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function L({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (<div><label htmlFor={id} className="mb-1 block font-bold">{label}</label>{hint && <p className="mb-1 text-sm text-grey">{hint}</p>}{children}{error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {error}</p>}</div>);
}

export function EpisodeEditor({ initial, articles }: { initial: EpData; articles: Opt[] }) {
  const [state, action, pending] = useActionState<EpState, FormData>(saveEpisode, {});
  const [f, setF] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [probe, setProbe] = useState<{ ok?: boolean; text?: string }>({});
  const [probing, startProbe] = useTransition();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; meta: string }[]>([]);
  const err = state.errors ?? {};
  const set = <K extends keyof EpData>(k: K, v: EpData[K]) => setF((p) => ({ ...p, [k]: v }));
  const on = (k: keyof EpData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const c = new AbortController();
    const t = setTimeout(async () => { try { const r = await fetch(`/admin/api/businesses?q=${encodeURIComponent(q)}`, { signal: c.signal }); if (r.ok) setHits(await r.json()); } catch { /* aborted */ } }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);

  const ch = f.chaptersText.trim() ? parseChapters(f.chaptersText) : null;
  const video = f.videoUrl.trim() ? parseVideoUrl(f.videoUrl) : null;
  const dur = f.durationText.trim() ? parseDuration(f.durationText) : null;
  const live = f.status === "PUBLISHED" && !f.scheduled;
  const checks = [
    ["Title", f.title.trim().length >= 5], ["Description (50+ characters)", f.description.trim().length >= 50],
    ["Audio or video added", !!f.audioUrl || !!f.videoUrl], ["Duration (for podcast apps)", !f.audioUrl || dur !== null], ["File size (for podcast apps)", !f.audioUrl || !!f.audioBytes],
    ["Cover image", !!f.imageUrl], ["Transcript or show notes (needed for search indexing)", f.transcript.trim().length >= 200 || f.showNotes.trim().length >= 200], ["Linked business", !!f.businessId],
  ] as const;

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_340px]" noValidate>
      {f.id && <input type="hidden" name="id" value={f.id} />}
      <div className="min-w-0 space-y-5">
        {state.message && <p role="alert" className="rounded-lg border-2 border-red-700 p-3 font-bold">⚠ {state.message}</p>}
        <L id="title" label="Title" error={err.title}><input id="title" name="title" value={f.title} onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} className={`${field} text-xl font-bold`} aria-invalid={!!err.title} /></L>
        <L id="description" label="Description" hint={`${f.description.length}/400 — plain text. Used in podcast apps and as the search snippet.`} error={err.description}><textarea id="description" name="description" rows={3} value={f.description} onChange={on("description")} className={field} /></L>
        <fieldset className="space-y-4 rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Media</legend>
          <L id="audioUrl" label="Audio file (https link to MP3 or M4A)" hint="Host the file with your podcast host or storage (we link to it, we don't store it)." error={err.audioUrl}>
            <div className="flex gap-2"><input id="audioUrl" name="audioUrl" value={f.audioUrl} onChange={on("audioUrl")} className={field} placeholder="https://…/episode-12.mp3" />
              <button type="button" disabled={probing || !f.audioUrl} onClick={() => startProbe(async () => { const r = await probeAudioAction(f.audioUrl); if (r.ok) { setF((p) => ({ ...p, audioBytes: String(r.bytes), audioMime: r.mime })); setProbe({ ok: true, text: `Found: ${(r.bytes / 1_000_000).toFixed(1)} MB, ${r.mime}` }); } else setProbe({ ok: false, text: r.error }); })} className="min-h-11 shrink-0 rounded-full border-2 border-ink px-4 font-bold">{probing ? "Checking…" : "Check file"}</button></div>
            {probe.text && <p role={probe.ok ? "status" : "alert"} className={`mt-1 text-sm font-bold ${probe.ok ? "" : "text-red-700"}`}>{probe.ok ? "✓" : "⚠"} {probe.text}</p>}</L>
          <div className="grid gap-4 sm:grid-cols-3">
            <L id="audioBytes" label="File size (bytes)" error={err.audioBytes}><input id="audioBytes" name="audioBytes" inputMode="numeric" value={f.audioBytes} onChange={on("audioBytes")} className={field} /></L>
            <L id="audioMime" label="File type" error={err.audioMime}><select id="audioMime" name="audioMime" value={f.audioMime} onChange={on("audioMime")} className={field}>{["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/wav"].map((m) => <option key={m}>{m}</option>)}</select></L>
            <L id="durationText" label="Duration" hint={dur !== null ? `= ${fmtDuration(dur)}` : "H:MM:SS or MM:SS"} error={err.durationText}><input id="durationText" name="durationText" value={f.durationText} onChange={on("durationText")} className={field} /></L>
          </div>
          <L id="videoUrl" label="Video (YouTube, Vimeo or direct .mp4)" hint={video ? `Detected: ${video.provider}${video.provider === "youtube" ? " (privacy-enhanced embed, loads only when played)" : ""}` : undefined} error={err.videoUrl}><input id="videoUrl" name="videoUrl" value={f.videoUrl} onChange={on("videoUrl")} className={field} placeholder="https://www.youtube.com/watch?v=…" /></L>
          <L id="imageUrl" label="Cover image (https, square 1400–3000px recommended)" error={err.imageUrl}><input id="imageUrl" name="imageUrl" value={f.imageUrl} onChange={on("imageUrl")} className={field} /></L>
        </fieldset>
        <L id="showNotes" label="Show notes" hint="Markdown-lite: ## headings, **bold**, [links](https://…), - lists." error={err.showNotes}><textarea id="showNotes" name="showNotes" rows={8} value={f.showNotes} onChange={on("showNotes")} className={`${field} font-mono text-sm`} /></L>
        <L id="chaptersText" label="Chapters" hint={ch ? (ch.ok ? `${ch.chapters.length} chapters ✓` : undefined) : "One per line, e.g. “00:00 Welcome”, “12:30 How it started”. Times must increase."} error={err.chaptersText || (ch && !ch.ok ? ch.error : undefined)}><textarea id="chaptersText" name="chaptersText" rows={5} value={f.chaptersText} onChange={on("chaptersText")} className={`${field} font-mono text-sm`} /></L>
        <L id="transcript" label="Transcript" hint={`${f.transcript.length.toLocaleString()} characters. Label speakers as “Sarah: …” — that lets us build the written interview automatically.`} error={err.transcript}><textarea id="transcript" name="transcript" rows={14} value={f.transcript} onChange={on("transcript")} className={`${field} font-mono text-sm`} /></L>
      </div>

      <aside className="space-y-5">
        <div className="rounded-xl border-2 border-ink p-4">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide">{live ? "Live" : f.scheduled ? "Scheduled" : "Draft"}</p>
          <div className="flex flex-col gap-2">
            <button name="intent" value="save" disabled={pending} className="min-h-11 rounded-full border-2 border-ink font-bold">{live ? "Save changes" : "Save draft"}</button>
            {!live && <button name="intent" value="publish" disabled={pending} className="min-h-11 rounded-full bg-yellow font-bold text-ink hover:bg-yellow-hover">Publish now</button>}
            {f.id && f.status === "PUBLISHED" && <button name="intent" value="unpublish" disabled={pending} className="min-h-11 rounded-full border-2 border-red-700 font-bold text-red-700">Unpublish</button>}
            {f.id && <a href={`/podcast/${f.slug}`} target="_blank" rel="noopener" className="min-h-11 rounded-full border-2 border-line py-2.5 text-center font-bold hover:bg-mist">View page ↗</a>}
          </div>
          <div className="mt-4 border-t border-line pt-3"><L id="publishedAt" label="Schedule (London time)" error={err.publishedAt}><input id="publishedAt" name="publishedAt" type="datetime-local" value={f.publishedAt} onChange={on("publishedAt")} className={field} /></L>
            <button name="intent" value="schedule" disabled={pending} className="mt-2 min-h-11 w-full rounded-full bg-ink font-bold text-yellow">Schedule</button></div>
        </div>
        <div className="rounded-xl bg-mist p-4 text-sm"><p className="mb-2 font-bold">Ready to publish?</p><ul className="space-y-1">{checks.map(([n, ok]) => <li key={n}><span aria-hidden>{ok ? "✓" : "○"}</span> <span className="sr-only">{ok ? "Done: " : "To do: "}</span>{n}</li>)}</ul></div>
        <div className="grid grid-cols-2 gap-3">
          <L id="number" label="Episode #" error={err.number}><input id="number" name="number" inputMode="numeric" value={f.number} onChange={on("number")} className={field} /></L>
          <L id="season" label="Season"><input id="season" name="season" inputMode="numeric" value={f.season} onChange={on("season")} className={field} /></L>
        </div>
        <L id="episodeType" label="Type" error={err.episodeType}><select id="episodeType" name="episodeType" value={f.episodeType} onChange={on("episodeType")} className={field}><option value="full">Full episode</option><option value="trailer">Trailer</option><option value="bonus">Bonus</option></select></L>
        <L id="slug" label="URL slug" error={err.slug}><input id="slug" name="slug" value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} className={`${field} font-mono text-sm`} /></L>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="explicit" checked={f.explicit} onChange={(e) => set("explicit", e.target.checked)} className="h-5 w-5" /> Explicit content</label>
        <L id="guestName" label="Guest name"><input id="guestName" name="guestName" value={f.guestName} onChange={on("guestName")} className={field} /></L>
        <L id="guestRole" label="Guest role"><input id="guestRole" name="guestRole" value={f.guestRole} onChange={on("guestRole")} className={field} placeholder="Founder, Brightwell Cleaning" /></L>
        <fieldset className="rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Featured business</legend>
          <input type="hidden" name="businessId" value={f.businessId} />
          {f.businessId ? <p className="mb-2 flex items-center justify-between text-sm"><strong>{f.businessName}</strong><button type="button" onClick={() => setF({ ...f, businessId: "", businessName: "" })} aria-label="Remove business" className="font-bold text-red-700">✕</button></p> : <p className="mb-2 text-sm text-grey">None. The episode shows on the business&apos;s profile when linked.</p>}
          {err.businessId && <p role="alert" className="mb-2 text-sm font-bold text-red-700">⚠ {err.businessId}</p>}
          <label htmlFor="bq" className="sr-only">Search businesses</label><input id="bq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search businesses…" className={field} autoComplete="off" />
          {hits.length > 0 && <ul className="mt-1 rounded-lg border-2 border-line bg-white">{hits.map((h) => <li key={h.id}><button type="button" onClick={() => { setF({ ...f, businessId: h.id, businessName: h.name }); setQ(""); setHits([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-yellow"><strong>{h.name}</strong> <span className="text-grey">{h.meta}</span></button></li>)}</ul>}
        </fieldset>
        <L id="articleId" label="Written article" hint="Link the written version of this interview." error={err.articleId}><select id="articleId" name="articleId" value={f.articleId} onChange={on("articleId")} className={field}><option value="">— none —</option>{articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></L>
      </aside>
    </form>
  );
}
