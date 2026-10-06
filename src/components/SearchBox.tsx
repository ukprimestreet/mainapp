"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type S = { type: string; label: string; sub?: string; href: string };
const ICON: Record<string, string> = { business: "🏪", category: "🏷", area: "📍", article: "📰", episode: "🎙" };

/** Accessible search combobox with live suggestions (ARIA 1.2 combobox + listbox pattern). */
export function SearchBox({ className = "", dark = false, id: idProp }: { className?: string; dark?: boolean; id?: string }) {
  const router = useRouter();
  const uid = useId();
  const listId = `${uid}-list`, inputId = idProp ?? `${uid}-input`;
  const [q, setQ] = useState("");
  const [items, setItems] = useState<S[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); setOpen(false); return; }
    const c = new AbortController();
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: c.signal }); if (r.ok) { const j = (await r.json()) as S[]; setItems(j); setOpen(j.length > 0); setActive(-1); } } catch { /* aborted */ }
    }, 150);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);
  useEffect(() => { const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", off); return () => document.removeEventListener("mousedown", off); }, []);

  const go = (href: string) => { setOpen(false); router.push(href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) { setOpen(true); setActive((a) => (a + 1) % items.length); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === "Escape") { if (open) e.preventDefault(); /* browsers clear type=search on Escape; first press just closes the list */ setOpen(false); setActive(-1); }
    else if (e.key === "Enter" && open && active >= 0) { e.preventDefault(); go(items[active].href); }
  };
  return (
    <div ref={box} className={`relative ${className}`}>
      <form role="search" action="/search" method="get" onSubmit={() => setOpen(false)} className="flex">
        <label htmlFor={inputId} className="sr-only">Search PrimeStreet</label>
        <input id={inputId} name="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onFocus={() => items.length && setOpen(true)} autoComplete="off" placeholder="Search businesses, stories…"
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${uid}-opt-${active}` : undefined}
          className={`min-h-10 w-full rounded-l-full border-2 px-4 text-sm ${dark ? "border-white/30 bg-white/10 text-white placeholder:text-white/60" : "border-line bg-white text-ink"}`} />
        <button className="min-h-10 rounded-r-full bg-yellow px-4 text-sm font-bold text-ink hover:bg-yellow-hover" aria-label="Search">Go</button>
      </form>
      {open && (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border-2 border-ink bg-white text-ink shadow-xl">
          {items.map((s, i) => (
            <li key={s.href + i} id={`${uid}-opt-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); go(s.href); }} onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${i === active ? "bg-yellow" : ""}`}>
              <span aria-hidden>{ICON[s.type] ?? "•"}</span><span className="min-w-0"><span className="block truncate font-bold">{s.label}</span>{s.sub && <span className="block truncate text-xs text-grey">{s.sub}</span>}</span>
            </li>))}
          <li role="presentation" className="border-t border-line"><button type="button" onMouseDown={(e) => { e.preventDefault(); go(`/search?q=${encodeURIComponent(q)}`); }} className="w-full px-3 py-2 text-left text-sm font-bold underline">See all results for “{q}”</button></li>
        </ul>
      )}
    </div>
  );
}
