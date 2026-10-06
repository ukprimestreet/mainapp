"use client";
import { useActionState, useState } from "react";
import { addClip, type EpState } from "../../../podcast-actions";

const field = "min-h-11 w-full rounded-lg border-2 border-line px-3 py-2";
export function ClipForm({ episodeId, kind, defaultSpeaker }: { episodeId: string; kind: "QUOTE" | "CLIP"; defaultSpeaker: string }) {
  const [s, action, pending] = useActionState<EpState, FormData>(addClip, {});
  const [f, setF] = useState({ title: "", quote: "", speaker: defaultSpeaker, start: "", end: "", note: "" });
  const e = s.errors ?? {};
  const id = (k: string) => `${kind}-${k}`;
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  const Err = ({ k }: { k: string }) => (e[k] ? <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e[k]}</p> : null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" noValidate>
      <input type="hidden" name="episodeId" value={episodeId} /><input type="hidden" name="kind" value={kind} />
      {kind === "QUOTE" ? (
        <div className="sm:col-span-2"><label htmlFor={id("quote")} className="mb-1 block font-bold">Quote <span className="font-normal text-grey">({f.quote.length}/280)</span></label><textarea id={id("quote")} name="quote" rows={3} value={f.quote} onChange={set("quote")} className={field} /><Err k="quote" /></div>
      ) : (
        <div className="sm:col-span-2"><label htmlFor={id("title")} className="mb-1 block font-bold">Clip title</label><input id={id("title")} name="title" value={f.title} onChange={set("title")} className={field} /><Err k="title" /></div>
      )}
      {kind === "QUOTE" && <div><label htmlFor={id("speaker")} className="mb-1 block font-bold">Speaker</label><input id={id("speaker")} name="speaker" value={f.speaker} onChange={set("speaker")} className={field} /></div>}
      <div><label htmlFor={id("start")} className="mb-1 block font-bold">{kind === "QUOTE" ? "Time in episode (optional)" : "Start"}</label><input id={id("start")} name="start" value={f.start} onChange={set("start")} placeholder="12:30" className={field} /><Err k="start" /></div>
      {kind === "CLIP" && <div><label htmlFor={id("end")} className="mb-1 block font-bold">End</label><input id={id("end")} name="end" value={f.end} onChange={set("end")} placeholder="13:05" className={field} /><Err k="end" /></div>}
      {kind === "CLIP" && <div className="sm:col-span-2"><label htmlFor={id("note")} className="mb-1 block font-bold">Note (optional)</label><input id={id("note")} name="note" value={f.note} onChange={set("note")} className={field} /></div>}
      {s.message && <p role={s.errors ? "alert" : "status"} className="font-bold sm:col-span-2">{s.errors ? "⚠" : "✓"} {s.message}</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow">{kind === "QUOTE" ? "Add quote" : "Add clip"}</button></div>
    </form>
  );
}
