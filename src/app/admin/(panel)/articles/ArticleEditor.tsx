"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Prose } from "@/components/Prose";
import { saveArticle, type ArticleState } from "../../article-actions";

export type EditorData = {
  id?: string; type: string; disclosure: string; title: string; slug: string; standfirst: string; body: string;
  imageUrl: string; imageAlt: string; imageCredit: string; sponsorName: string; seoTitle: string; seoDescription: string;
  authorId: string; locationId: string; featured: boolean; publishedAt: string; episodeId: string;
  status: string; scheduled: boolean; businesses: { id: string; name: string; meta: string; founder: boolean }[];
};
type Opt = { id: string; name: string };
type Props = { initial: EditorData; types: { key: string; label: string }[]; disclosures: { key: string; label: string }[]; authors: Opt[]; locations: Opt[]; episodes: Opt[] };

const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const field = "min-h-11 w-full rounded-lg border-2 border-line bg-white px-3 py-2";

function L({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-bold">{label}</label>
      {hint && <p className="mb-1 text-sm text-grey">{hint}</p>}
      {children}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {error}</p>}
    </div>
  );
}

export function ArticleEditor({ initial, types, disclosures, authors, locations, episodes }: Props) {
  const [state, action, pending] = useActionState<ArticleState, FormData>(saveArticle, {});
  const [f, setF] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<EditorData["businesses"]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const err = state.errors ?? {};
  const set = <K extends keyof EditorData>(k: K, v: EditorData[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const c = new AbortController();
    const t = setTimeout(async () => {
      try { const r = await fetch(`/admin/api/businesses?q=${encodeURIComponent(q)}`, { signal: c.signal }); if (r.ok) setHits(await r.json()); } catch { /* aborted */ }
    }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);

  function wrap(before: string, after = "", placeholder = "text") {
    const el = bodyRef.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b) || placeholder;
    set("body", value.slice(0, a) + before + sel + after + value.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length); });
  }
  const block = (prefix: string, placeholder: string) => {
    const el = bodyRef.current; if (!el) return;
    const a = el.selectionStart; const pre = f.body.slice(0, a); const sep = pre && !pre.endsWith("\n\n") ? (pre.endsWith("\n") ? "\n" : "\n\n") : "";
    set("body", pre + sep + prefix + placeholder + "\n\n" + f.body.slice(el.selectionEnd));
  };

  const words = f.body.split(/\s+/).filter(Boolean).length;
  const founderLinked = f.businesses.some((b) => b.founder);
  const checks = [
    ["Title", f.title.trim().length >= 5],
    ["Standfirst (30–220 chars)", f.standfirst.trim().length >= 30 && f.standfirst.length <= 220],
    ["Body (300+ characters)", f.body.trim().length >= 300],
    ["Author chosen", !!f.authorId],
    ["Image has alt text (if image set)", !f.imageUrl || !!f.imageAlt.trim()],
    ["Sponsor named (if not editorial)", f.disclosure === "EDITORIAL" || !!f.sponsorName.trim()],
    ["Business linked (Interview / Business of the Week)", !["INTERVIEW", "BOTW"].includes(f.type) || f.businesses.length > 0],
  ] as const;
  const live = f.status === "PUBLISHED" && !f.scheduled;

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_340px]" noValidate>
      {f.id && <input type="hidden" name="id" value={f.id} />}
      <div className="space-y-5">
        {state.message && <p role="alert" className="rounded-lg border-2 border-red-700 p-3 font-bold">⚠ {state.message}</p>}
        <L id="title" label="Title" error={err.title}>
          <input id="title" name="title" value={f.title} onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} className={`${field} text-xl font-bold`} aria-invalid={!!err.title} />
        </L>
        <L id="standfirst" label="Standfirst" hint={`${f.standfirst.length}/220 — the one-or-two sentence summary under the headline and in search results.`} error={err.standfirst}>
          <textarea id="standfirst" name="standfirst" rows={2} value={f.standfirst} onChange={(e) => set("standfirst", e.target.value)} className={field} />
        </L>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="body" className="font-bold">Body <span className="font-normal text-grey">({words} words)</span></label>
            <div role="tablist" aria-label="Editor mode" className="flex gap-1">
              {(["write", "preview"] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={tab === m} onClick={() => setTab(m)} className={`min-h-9 rounded-full px-4 text-sm font-bold ${tab === m ? "bg-ink text-yellow" : "border border-line"}`}>{m === "write" ? "Write" : "Preview"}</button>)}
            </div>
          </div>
          {tab === "write" && (
            <div className="mb-2 flex flex-wrap gap-1" role="toolbar" aria-label="Formatting">
              {[["H2", () => block("## ", "Heading")], ["H3", () => block("### ", "Subheading")], ["Bold", () => wrap("**", "**")], ["Italic", () => wrap("*", "*")], ["Link", () => wrap("[", "](https://)", "link text")], ["Quote", () => block("> ", "Quote")], ["List", () => block("- ", "Item")], ["Image", () => block("![Describe the image](https://", ")")]].map(([n, fn]) => (
                <button key={n as string} type="button" onClick={fn as () => void} className="min-h-9 rounded-lg border-2 border-line px-3 text-sm font-bold hover:bg-yellow">{n as string}</button>
              ))}
            </div>
          )}
          <textarea ref={bodyRef} id="body" name="body" rows={20} value={f.body} onChange={(e) => set("body", e.target.value)} className={`${field} font-mono text-sm ${tab === "preview" ? "sr-only" : ""}`} aria-invalid={!!err.body} aria-describedby={err.body ? "body-err" : undefined} />
          {tab === "preview" && <div className="min-h-64 rounded-lg border-2 border-line p-5">{f.body.trim() ? <Prose text={f.body} /> : <p className="text-grey">Nothing to preview yet.</p>}</div>}
          {err.body && <p id="body-err" role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {err.body}</p>}
          <p className="mt-1 text-xs text-grey">Markdown-lite: ## headings, **bold**, *italic*, [links](url), &gt; quotes, - lists, ![alt](https://image). No HTML.</p>
        </div>
        <fieldset className="space-y-4 rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Image</legend>
          <L id="imageUrl" label="Image URL (https)" error={err.imageUrl}><input id="imageUrl" name="imageUrl" value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} className={field} /></L>
          <div className="grid gap-4 sm:grid-cols-2">
            <L id="imageAlt" label="Alt text" error={err.imageAlt}><input id="imageAlt" name="imageAlt" value={f.imageAlt} onChange={(e) => set("imageAlt", e.target.value)} className={field} /></L>
            <L id="imageCredit" label="Credit"><input id="imageCredit" name="imageCredit" value={f.imageCredit} onChange={(e) => set("imageCredit", e.target.value)} className={field} /></L>
          </div>
        </fieldset>
        <fieldset className="space-y-4 rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Search appearance</legend>
          <L id="seoTitle" label="SEO title (optional)" hint={`${f.seoTitle.length}/70 — defaults to the headline`} error={err.seoTitle}><input id="seoTitle" name="seoTitle" value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} className={field} /></L>
          <L id="seoDescription" label="Meta description (optional)" hint={`${f.seoDescription.length}/160 — defaults to the standfirst`} error={err.seoDescription}><textarea id="seoDescription" name="seoDescription" rows={2} value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} className={field} /></L>
        </fieldset>
      </div>

      <aside className="space-y-5">
        <div className="rounded-xl border-2 border-ink p-4">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide">{live ? "Live" : f.scheduled ? "Scheduled" : "Draft"}</p>
          <div className="flex flex-col gap-2">
            <button name="intent" value="save" disabled={pending} className="min-h-11 rounded-full border-2 border-ink font-bold">{live ? "Save changes" : "Save draft"}</button>
            {!live && <button name="intent" value="publish" disabled={pending} className="min-h-11 rounded-full bg-yellow font-bold text-ink hover:bg-yellow-hover">Publish now</button>}
            {f.id && f.status === "PUBLISHED" && <button name="intent" value="unpublish" disabled={pending} className="min-h-11 rounded-full border-2 border-red-700 font-bold text-red-700">Unpublish</button>}
            {f.id && <a href={`/admin/articles/${f.id}/preview`} target="_blank" rel="noopener" className="min-h-11 rounded-full border-2 border-line py-2.5 text-center font-bold hover:bg-mist">Open preview ↗</a>}
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <L id="publishedAt" label="Schedule (London time)" error={err.publishedAt}><input id="publishedAt" name="publishedAt" type="datetime-local" value={f.publishedAt} onChange={(e) => set("publishedAt", e.target.value)} className={field} /></L>
            <button name="intent" value="schedule" disabled={pending} className="mt-2 min-h-11 w-full rounded-full bg-ink font-bold text-yellow">Schedule</button>
          </div>
        </div>
        <div className="rounded-xl bg-mist p-4 text-sm"><p className="mb-2 font-bold">Ready to publish?</p>
          <ul className="space-y-1">{checks.map(([n, ok]) => <li key={n}><span aria-hidden>{ok ? "✓" : "○"}</span> <span className="sr-only">{ok ? "Done: " : "To do: "}</span>{n}</li>)}</ul></div>

        <L id="type" label="Content type" error={err.type}><select id="type" name="type" value={f.type} onChange={(e) => set("type", e.target.value)} className={field}><option value="">Select…</option>{types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></L>
        <L id="disclosure" label="Disclosure" error={err.disclosure} hint="Anything other than Editorial is labelled prominently to readers.">
          <select id="disclosure" name="disclosure" value={f.disclosure} onChange={(e) => set("disclosure", e.target.value)} className={field}>{disclosures.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></L>
        {f.disclosure !== "EDITORIAL" && <L id="sponsorName" label="Sponsor / partner name" error={err.sponsorName}><input id="sponsorName" name="sponsorName" value={f.sponsorName} onChange={(e) => set("sponsorName", e.target.value)} className={field} /></L>}
        <L id="authorId" label="Author" error={err.authorId}><select id="authorId" name="authorId" value={f.authorId} onChange={(e) => set("authorId", e.target.value)} className={field}><option value="">Select…</option>{authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></L>
        <L id="slug" label="URL slug" error={err.slug}><input id="slug" name="slug" value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} className={`${field} font-mono text-sm`} /></L>
        <L id="locationId" label="Area (optional)"><select id="locationId" name="locationId" value={f.locationId} onChange={(e) => set("locationId", e.target.value)} className={field}><option value="">— none —</option>{locations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></L>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="featured" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} className="h-5 w-5" /> Feature on home page</label>

        <fieldset className="rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Linked businesses</legend>
          {err.businessIds && <p role="alert" className="mb-2 text-sm font-bold text-red-700">⚠ {err.businessIds}</p>}
          <ul className="mb-3 space-y-1">{f.businesses.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-sm"><input type="hidden" name="businessIds" value={b.id} /><span><strong>{b.name}</strong>{b.founder && <span className="ml-1 rounded bg-yellow px-1 text-xs font-bold">founder-owned</span>}</span>
              <button type="button" onClick={() => set("businesses", f.businesses.filter((x) => x.id !== b.id))} aria-label={`Remove ${b.name}`} className="font-bold text-red-700">✕</button></li>))}
            {f.businesses.length === 0 && <li className="text-sm text-grey">None linked.</li>}</ul>
          <label htmlFor="bq" className="sr-only">Search businesses to link</label>
          <input id="bq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search businesses to link…" className={field} autoComplete="off" />
          {hits.length > 0 && <ul className="mt-1 rounded-lg border-2 border-line bg-white">{hits.filter((h) => !f.businesses.some((b) => b.id === h.id)).map((h) => (
            <li key={h.id}><button type="button" onClick={() => { set("businesses", [...f.businesses, h]); setQ(""); setHits([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-yellow"><strong>{h.name}</strong> <span className="text-grey">{h.meta}</span></button></li>))}</ul>}
          {founderLinked && <p role="note" className="mt-3 rounded-lg bg-yellow-soft p-2 text-xs font-semibold">A founder-owned business is linked. Readers will automatically see a disclosure. Keep the coverage balanced.</p>}
        </fieldset>
        <L id="episodeId" label="Podcast episode (optional)" hint="Link the episode this written piece belongs to."><select id="episodeId" name="episodeId" value={f.episodeId} onChange={(e) => set("episodeId", e.target.value)} className={field}><option value="">— none —</option>{episodes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></L>
      </aside>
    </form>
  );
}
