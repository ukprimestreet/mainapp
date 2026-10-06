"use client";
import { useEffect, useRef, useState } from "react";
import { fmtDuration, type Chapter } from "@/lib/podcast-shared";

/** Native audio element (accessible by default) + speed, skip, chapter jumps and a once-per-visit play beacon. */
export function EpisodePlayer({ slug, audioUrl, mime, chapters }: { slug: string; audioUrl: string; mime: string; chapters: Chapter[] }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const [now, setNow] = useState(0);
  const beaconSent = useRef(false);

  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate]);
  const seek = (t: number) => { const a = ref.current; if (!a) return; a.currentTime = Math.max(0, t); void a.play().catch(() => {}); };
  const skip = (d: number) => { const a = ref.current; if (a) a.currentTime = Math.max(0, Math.min(a.duration || 1e9, a.currentTime + d)); };
  const current = chapters.length ? [...chapters].reverse().find((c) => c.t <= now) : undefined;

  return (
    <section aria-label="Audio player" className="rounded-2xl border-2 border-ink p-4 sm:p-5">
      <audio ref={ref} controls preload="none" className="w-full"
        onTimeUpdate={(e) => setNow(Math.floor(e.currentTarget.currentTime))}
        onPlay={() => { if (!beaconSent.current) { beaconSent.current = true; void fetch("/api/podcast/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }), keepalive: true }).catch(() => {}); } }}>
        <source src={audioUrl} type={mime} />
        Your browser can&apos;t play this audio. <a href={audioUrl}>Download the episode</a>.
      </audio>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => skip(-15)} className="min-h-10 rounded-full border-2 border-ink px-4 font-bold">⟲ 15s</button>
        <button type="button" onClick={() => skip(30)} className="min-h-10 rounded-full border-2 border-ink px-4 font-bold">30s ⟳</button>
        <label className="ml-auto flex items-center gap-2 font-bold" htmlFor={`rate-${slug}`}>Speed
          <select id={`rate-${slug}`} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="min-h-10 rounded-lg border-2 border-line px-2">{[0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}</select></label>
        <a href={audioUrl} download className="min-h-10 rounded-full px-3 py-2 font-bold underline">Download</a>
      </div>
      {chapters.length > 0 && (
        <nav aria-label="Chapters" className="mt-4 border-t border-line pt-4"><h2 className="mb-2 font-display text-lg font-extrabold">Chapters</h2>
          <ol className="space-y-1">{chapters.map((c) => (
            <li key={c.t}><button type="button" onClick={() => seek(c.t)} aria-label={`Jump to ${fmtDuration(c.t)}: ${c.title}`} aria-current={current?.t === c.t ? "true" : undefined} className={`flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left hover:bg-yellow ${current?.t === c.t ? "bg-yellow-soft font-bold" : ""}`}>
              <span className="w-14 shrink-0 font-mono text-sm">{fmtDuration(c.t)}</span><span>{c.title}</span></button></li>))}</ol></nav>
      )}
    </section>
  );
}
