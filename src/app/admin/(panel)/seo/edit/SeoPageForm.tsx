"use client";
import { useActionState, useState } from "react";
import { deleteSeoPage, saveSeoPage, type SeoState } from "../../../seo-actions";

const field = "min-h-11 w-full rounded-lg border-2 border-line bg-white px-3 py-2";
type I = { title: string; description: string; intro: string; robots: string };

export function SeoPageForm({ path, initial, exists }: { path: string; initial: I; exists: boolean }) {
  const [s, action, pending] = useActionState<SeoState, FormData>(saveSeoPage, {});
  const [f, setF] = useState(initial);
  const e = s.errors ?? {};
  const set = (k: keyof I) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value });
  const count = (n: number, max: number) => <span className={n > max ? "font-bold text-red-700" : "text-grey"}>{n}/{max}</span>;
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <form action={action} className="space-y-5" noValidate>
        <input type="hidden" name="path" value={path} />
        {s.message && <p role={s.ok ? "status" : "alert"} className={`rounded-lg border-2 px-4 py-2 font-bold ${s.ok ? "border-ink bg-yellow" : "border-red-700"}`}>{s.ok ? "✓" : "⚠"} {s.message}</p>}
        <div><label htmlFor="title" className="mb-1 block font-bold">Title override {count(f.title.length, 70)}</label><p className="mb-1 text-sm text-grey">Leave blank to use the automatic title.</p>
          <input id="title" name="title" value={f.title} onChange={set("title")} className={field} />{e.title && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.title}</p>}</div>
        <div><label htmlFor="description" className="mb-1 block font-bold">Meta description override {count(f.description.length, 160)}</label>
          <textarea id="description" name="description" rows={2} value={f.description} onChange={set("description")} className={field} />{e.description && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.description}</p>}</div>
        <div><label htmlFor="intro" className="mb-1 block font-bold">Original intro {count(f.intro.length, 3000)}</label><p className="mb-1 text-sm text-grey">Shown on the page. Write something genuinely useful about this area/category in your own words (100+ characters unlocks indexing). Please don&apos;t paste text from elsewhere or write filler: thin or duplicated copy hurts the whole site.</p>
          <textarea id="intro" name="intro" rows={9} value={f.intro} onChange={set("intro")} className={field} />{e.intro && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.intro}</p>}</div>
        <div><label htmlFor="robots" className="mb-1 block font-bold">Indexing</label>
          <select id="robots" name="robots" value={f.robots} onChange={set("robots")} className={field}>
            <option value="AUTO">Automatic — follow the quality gate (recommended)</option><option value="NOINDEX">Never index this page</option><option value="INDEX">Force index (overrides the thin-content check; never works on empty pages)</option></select></div>
        <div className="flex flex-wrap items-center gap-4"><button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow">{pending ? "Saving…" : "Save"}</button></div>
      </form>
      <aside className="space-y-6">
        <div><h2 className="mb-2 font-bold">Search result preview</h2>
          <div className="rounded-xl border border-line p-4"><p className="text-xs text-grey">primestreet.uk{path}</p><p className="text-lg text-blue-800 [overflow-wrap:anywhere]">{f.title || "Automatic title"} | PrimeStreet</p><p className="text-sm text-grey [overflow-wrap:anywhere]">{f.description || "Automatic description built from the page's real data."}</p></div></div>
        {exists && <form action={deleteSeoPage}><input type="hidden" name="path" value={path} /><button className="font-bold text-red-700 underline">Reset this page to automatic</button></form>}
      </aside>
    </div>
  );
}
