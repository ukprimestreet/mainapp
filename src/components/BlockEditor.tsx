"use client";

import { useEffect, useRef, useState } from "react";
import { BLOCK_KINDS, emptyBlock, newId, safeHref, type Block, type BlockType } from "@/lib/blocks";
import { area, btn, field, labelCls } from "./Dash";

/**
 * The visual editor. Blocks can be reordered by dragging, and equally by the Move up / Move down buttons —
 * drag and drop alone is unusable with a keyboard or a screen reader, so both always exist.
 *
 * The whole document is kept in one hidden input as JSON, so the surrounding <form> submits normally and
 * works without client-side routing.
 */
export function BlockEditor({ name, initial, onChange }: { name: string; initial: Block[]; onChange?: (b: Block[]) => void }) {
  const [blocks, setBlocks] = useState<Block[]>(initial.length ? initial : [emptyBlock("paragraph")]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  // Let the surrounding form show a live word count without owning the document.
  useEffect(() => { onChange?.(blocks); }, [blocks, onChange]);

  const update = (id: string, patch: Partial<Block>) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));

  const add = (type: BlockType, afterId?: string) =>
    setBlocks((bs) => {
      const b = emptyBlock(type);
      if (!afterId) return [...bs, b];
      const i = bs.findIndex((x) => x.id === afterId);
      return [...bs.slice(0, i + 1), b, ...bs.slice(i + 1)];
    });

  const remove = (id: string) => setBlocks((bs) => (bs.length === 1 ? [emptyBlock("paragraph")] : bs.filter((b) => b.id !== id)));

  const move = (id: string, dir: -1 | 1) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const copy = [...bs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      setAnnounce(`Block moved to position ${j + 1} of ${copy.length}.`);
      return copy;
    });

  const dropOn = (targetId: string) => {
    setBlocks((bs) => {
      if (!dragging || dragging === targetId) return bs;
      const from = bs.findIndex((b) => b.id === dragging);
      const to = bs.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return bs;
      const copy = [...bs];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      setAnnounce(`Block moved to position ${to + 1} of ${copy.length}.`);
      return copy;
    });
    setDragging(null); setOver(null);
  };

  const duplicate = (id: string) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      if (i < 0) return bs;
      return [...bs.slice(0, i + 1), { ...bs[i], id: newId() } as Block, ...bs.slice(i + 1)];
    });

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(blocks)} />
      <p aria-live="polite" className="sr-only">{announce}</p>

      <ol className="space-y-3">
        {blocks.map((b, i) => (
          <li
            key={b.id}
            onDragOver={(e) => { e.preventDefault(); setOver(b.id); }}
            onDragLeave={() => setOver((o) => (o === b.id ? null : o))}
            onDrop={(e) => { e.preventDefault(); dropOn(b.id); }}
            className={`rounded-2xl border-2 bg-white transition ${over === b.id && dragging !== b.id ? "border-ink ring-4 ring-yellow" : "border-line"} ${dragging === b.id ? "opacity-50" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  draggable
                  onDragStart={() => { setDragging(b.id); setAnnounce("Dragging. Drop on another block to move it there."); }}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  title="Drag to reorder"
                  aria-hidden
                  className="cursor-grab select-none rounded px-2 py-1 text-grey hover:bg-mist active:cursor-grabbing"
                >⠿</span>
                <span className="text-xs font-extrabold uppercase tracking-wider text-grey">
                  {i + 1}. {BLOCK_KINDS.find((k) => k.type === b.type)?.label ?? b.type}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-xs font-bold">
                <button type="button" onClick={() => move(b.id, -1)} disabled={i === 0} className="rounded px-2 py-1 underline disabled:opacity-40">Move up</button>
                <button type="button" onClick={() => move(b.id, 1)} disabled={i === blocks.length - 1} className="rounded px-2 py-1 underline disabled:opacity-40">Move down</button>
                <button type="button" onClick={() => duplicate(b.id)} className="rounded px-2 py-1 underline">Duplicate</button>
                <button type="button" onClick={() => remove(b.id)} className="rounded px-2 py-1 text-red-800 underline">Remove</button>
              </div>
            </div>

            <div className="p-3">
              <BlockFields block={b} onChange={(patch) => update(b.id, patch)} />
            </div>

            <div className="flex flex-wrap items-center gap-1 border-t border-line px-3 py-2 text-xs">
              <span className="mr-1 font-bold text-grey">Insert after:</span>
              {BLOCK_KINDS.map((k) => (
                <button key={k.type} type="button" onClick={() => add(k.type, b.id)} title={k.hint}
                  className="rounded-full border border-line px-2 py-1 font-bold hover:border-ink hover:bg-yellow">+ {k.label}</button>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-2xl border-2 border-dashed border-line p-4">
        <p className="mb-2 text-sm font-bold">Add a block</p>
        <div className="flex flex-wrap gap-2">
          {BLOCK_KINDS.map((k) => (
            <button key={k.type} type="button" onClick={() => add(k.type)} title={k.hint} className={btn("ghost")}>+ {k.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BlockFields({ block: b, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  switch (b.type) {
    case "paragraph":
      return (
        <>
          <label className="sr-only" htmlFor={`t-${b.id}`}>Paragraph text</label>
          <textarea id={`t-${b.id}`} rows={4} value={b.text} onChange={(e) => onChange({ text: e.target.value })} className={area}
            placeholder="Write the paragraph. **bold**, *italic* and [link text](https://example.com) all work." />
        </>
      );

    case "heading":
      return (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor={`h-${b.id}`}>Heading text</label>
            <input id={`h-${b.id}`} value={b.text} onChange={(e) => onChange({ text: e.target.value })} className={field} placeholder="Section heading" />
          </div>
          <div>
            <label className={labelCls} htmlFor={`hl-${b.id}`}>Level</label>
            <select id={`hl-${b.id}`} value={b.level} onChange={(e) => onChange({ level: e.target.value === "3" ? 3 : 2 })} className={field}>
              <option value={2}>Main (H2)</option>
              <option value={3}>Sub (H3)</option>
            </select>
          </div>
        </div>
      );

    case "image":
      return (
        <div className="space-y-3">
          <ImagePicker value={b.url} onChange={(url) => onChange({ url })} />
          <div>
            <label className={labelCls} htmlFor={`alt-${b.id}`}>Alt text (required)</label>
            <input id={`alt-${b.id}`} value={b.alt} onChange={(e) => onChange({ alt: e.target.value })} className={field}
              placeholder="Describe the picture for someone who cannot see it." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor={`cap-${b.id}`}>Caption (optional)</label>
              <input id={`cap-${b.id}`} value={b.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} className={field} />
            </div>
            <div>
              <label className={labelCls} htmlFor={`ih-${b.id}`}>Make it clickable (optional)</label>
              <input id={`ih-${b.id}`} value={b.href ?? ""} onChange={(e) => onChange({ href: e.target.value })} className={field} placeholder="https://… or /a-page-here" />
              <Hint value={b.href} />
            </div>
          </div>
        </div>
      );

    case "video":
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor={`v-${b.id}`}>YouTube or Vimeo link</label>
            <input id={`v-${b.id}`} value={b.url} onChange={(e) => onChange({ url: e.target.value })} className={field}
              placeholder="https://www.youtube.com/watch?v=…" />
            <p className="mt-1 text-xs text-grey">Nothing loads from YouTube until a reader presses play.</p>
            <Hint value={b.url} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`vc-${b.id}`}>Caption (optional)</label>
            <input id={`vc-${b.id}`} value={b.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} className={field} />
          </div>
        </div>
      );

    case "quote":
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor={`q-${b.id}`}>Quote</label>
            <textarea id={`q-${b.id}`} rows={3} value={b.text} onChange={(e) => onChange({ text: e.target.value })} className={area}
              placeholder="Only words that were actually said or written." />
          </div>
          <div>
            <label className={labelCls} htmlFor={`qc-${b.id}`}>Who said it</label>
            <input id={`qc-${b.id}`} value={b.cite ?? ""} onChange={(e) => onChange({ cite: e.target.value })} className={field} placeholder="Name, role, company" />
          </div>
        </div>
      );

    case "list":
      return (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <label className={labelCls} htmlFor={`ls-${b.id}`}>Style</label>
              <select id={`ls-${b.id}`} value={b.style} onChange={(e) => onChange({ style: e.target.value === "number" ? "number" : "bullet" })} className={field}>
                <option value="bullet">Bulleted</option>
                <option value="number">Numbered</option>
              </select>
            </div>
          </div>
          <ol className="space-y-2">
            {b.items.map((item, n) => (
              <li key={n} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-sm font-bold text-grey">{b.style === "number" ? `${n + 1}.` : "•"}</span>
                <label className="sr-only" htmlFor={`li-${b.id}-${n}`}>Item {n + 1}</label>
                <input id={`li-${b.id}-${n}`} value={item} className={field}
                  onChange={(e) => onChange({ items: b.items.map((x, j) => (j === n ? e.target.value : x)) })} />
                <button type="button" aria-label={`Remove item ${n + 1}`}
                  onClick={() => onChange({ items: b.items.length === 1 ? [""] : b.items.filter((_, j) => j !== n) })}
                  className="shrink-0 px-2 text-sm font-bold text-red-800 underline">Remove</button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => onChange({ items: [...b.items, ""] })} className="text-sm font-bold underline">+ Add item</button>
        </div>
      );

    case "button":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor={`bl-${b.id}`}>Button text</label>
            <input id={`bl-${b.id}`} value={b.label} onChange={(e) => onChange({ label: e.target.value })} className={field} placeholder="Read the full guide" />
          </div>
          <div>
            <label className={labelCls} htmlFor={`bh-${b.id}`}>Links to</label>
            <input id={`bh-${b.id}`} value={b.href} onChange={(e) => onChange({ href: e.target.value })} className={field} placeholder="https://… or /a-page-here" />
            <Hint value={b.href} />
          </div>
        </div>
      );

    case "divider":
      return <p className="text-sm text-grey">A horizontal line between sections. Nothing to fill in.</p>;
  }
}

/** Tells the author immediately when a link will be dropped, rather than silently losing it on save. */
function Hint({ value }: { value?: string | null }) {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (safeHref(v)) return <p className="mt-1 text-xs font-bold text-grey">Links to {v}</p>;
  return <p className="mt-1 text-xs font-bold text-red-800">That link will be removed. Use an https:// address or a path starting with /.</p>;
}

function ImagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pick(file: File) {
    setError(""); setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file); fd.set("kind", "image");
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) setError(j.error ?? "The upload failed."); else onChange(j.url);
    } catch { setError("The upload failed. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {value && <img src={value} alt="" className="h-20 w-28 rounded-lg border-2 border-line object-cover" />}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
          id={`img-${value.slice(-8) || "new"}-${Math.random().toString(36).slice(2, 6)}`}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
        <button type="button" onClick={() => input.current?.click()} className={btn("ghost")}>
          {busy ? "Uploading…" : value ? "Replace image" : "Upload an image"}
        </button>
        {value && <button type="button" onClick={() => onChange("")} className="text-sm font-bold text-red-800 underline">Remove</button>}
      </div>
      <p className="mt-1 text-xs text-grey">JPEG, PNG or WebP, up to 5MB.</p>
      {error && <p role="alert" className="mt-1 text-sm font-bold text-red-800">{error}</p>}
    </div>
  );
}
