"use client";
import { useActionState, useState } from "react";
import { saveShow, type EpState } from "../../../podcast-actions";

const field = "min-h-11 w-full rounded-lg border-2 border-line px-3 py-2";
type S = { title: string; description: string; author: string; ownerEmail: string; imageUrl: string; language: string; category: string; explicit: boolean; copyright: string; spotifyUrl: string; appleUrl: string; youtubeUrl: string };
const CATS = ["Business", "Business News", "Careers", "Entrepreneurship", "Investing", "Management", "Marketing", "Non-Profit", "News", "Society & Culture", "Education", "Technology"];

export function ShowForm({ initial }: { initial: S }) {
  const [s, action, pending] = useActionState<EpState, FormData>(saveShow, {});
  const [f, setF] = useState(initial);
  const e = s.errors ?? {};
  const row = (k: Exclude<keyof S, "explicit" | "category" | "description">, label: string, hint?: string) => (
    <div><label htmlFor={k} className="mb-1 block font-bold">{label}</label>{hint && <p className="mb-1 text-sm text-grey">{hint}</p>}<input id={k} name={k} value={f[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} className={field} aria-invalid={!!e[k]} />{e[k] && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e[k]}</p>}</div>
  );
  return (
    <form action={action} className="max-w-2xl space-y-4" noValidate>
      {s.message && <p role={s.errors ? "alert" : "status"} className="rounded-lg border-2 border-ink px-4 py-2 font-bold">{s.errors ? "⚠" : "✓"} {s.message}</p>}
      {row("title", "Show title")}
      <div><label htmlFor="description" className="mb-1 block font-bold">Description</label><textarea id="description" name="description" rows={4} value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} className={field} />{e.description && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.description}</p>}</div>
      <div className="grid gap-4 sm:grid-cols-2">{row("author", "Author / publisher")}{row("ownerEmail", "Owner email", "Used by Apple to verify ownership. Not shown on the site.")}{row("language", "Language", "e.g. en-gb")}
        <div><label htmlFor="category" className="mb-1 block font-bold">Category</label><select id="category" name="category" value={f.category} onChange={(ev) => setF({ ...f, category: ev.target.value })} className={field}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div></div>
      {row("imageUrl", "Cover art (https, square, 1400–3000px)")}{row("copyright", "Copyright line")}
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="explicit" checked={f.explicit} onChange={(ev) => setF({ ...f, explicit: ev.target.checked })} className="h-5 w-5" /> Show contains explicit content</label>
      <fieldset className="space-y-4 rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Listen links (shown on the podcast page)</legend>{row("spotifyUrl", "Spotify")}{row("appleUrl", "Apple Podcasts")}{row("youtubeUrl", "YouTube channel")}</fieldset>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow">{pending ? "Saving…" : "Save show settings"}</button>
    </form>
  );
}
