"use client";

import { useState } from "react";
import { btn } from "@/components/Dash";

/**
 * Photo manager. Uploads go straight to storage and the resulting URLs are carried in hidden inputs, so the
 * surrounding form posts a plain list. Order is the order they appear on the profile, and it can be changed
 * with the arrow buttons as well as by dragging — dragging alone excludes keyboard users.
 */
export function PhotoManager({ initial, max }: { initial: string[]; max: number }) {
  const [photos, setPhotos] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);

  async function add(files: FileList) {
    setError(""); setBusy(true);
    const next = [...photos];
    for (const file of Array.from(files).slice(0, max - photos.length)) {
      try {
        const fd = new FormData();
        fd.set("file", file); fd.set("kind", "image");
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const j = (await r.json()) as { url?: string; error?: string };
        if (!r.ok || !j.url) { setError(j.error ?? "That upload failed."); break; }
        next.push(j.url);
      } catch { setError("The upload failed. Check your connection."); break; }
    }
    setPhotos(next); setBusy(false);
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const copy = [...photos];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setPhotos(copy);
  };

  const drop = (target: number) => {
    if (dragging === null || dragging === target) return;
    const copy = [...photos];
    const [moved] = copy.splice(dragging, 1);
    copy.splice(target, 0, moved);
    setPhotos(copy); setDragging(null);
  };

  return (
    <div>
      {photos.map((p) => <input key={p} type="hidden" name="photo" value={p} />)}

      {photos.length === 0 ? (
        <p className="mb-4 text-[15px] text-grey">No photos yet. The first one is the one most people will see.</p>
      ) : (
        <ol className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((url, i) => (
            <li
              key={url}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)}
              className={`overflow-hidden rounded-2xl border-2 bg-white ${dragging === i ? "border-ink opacity-50" : "border-line"}`}
            >
              <img src={url} alt={`Photo ${i + 1} of your business`} className="aspect-[4/3] w-full object-cover" />
              <div className="flex items-center justify-between gap-1 px-2 py-2 text-[12px] font-bold">
                <span
                  draggable onDragStart={() => setDragging(i)} onDragEnd={() => setDragging(null)}
                  aria-hidden title="Drag to reorder"
                  className="cursor-grab select-none px-1 text-grey active:cursor-grabbing"
                >⠿</span>
                <span className="text-grey">{i === 0 ? "Shown first" : `#${i + 1}`}</span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1.5 underline disabled:opacity-40">Up</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} className="px-1.5 underline disabled:opacity-40">Down</button>
                  <button type="button" onClick={() => setPhotos(photos.filter((_, n) => n !== i))} className="px-1.5 text-red-800 underline">Remove</button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          id="photo-files" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only"
          disabled={photos.length >= max}
          onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ""; }}
        />
        <label htmlFor="photo-files" className={`${btn("ghost")} ${photos.length >= max ? "pointer-events-none opacity-40" : "cursor-pointer"}`}>
          {busy ? "Uploading…" : "Add photos"}
        </label>
        <button className={btn()} disabled={busy}>Save photos</button>
        <span className="text-[13px] text-grey">{photos.length} of {max} · JPEG, PNG or WebP, up to 5MB each</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-bold text-red-800">{error}</p>}
    </div>
  );
}
