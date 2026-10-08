"use client";

import { useRef, useState } from "react";
import { Chip, btn, labelCls } from "./Dash";

/**
 * File picker that uploads straight away and keeps the resulting URL in a hidden input, so the surrounding
 * form just submits a string. Portraits come back as a public URL and previews; CVs come back as a private
 * reference and only show the file name.
 */
export function UploadField({
  name, kind, value, onChange, label, needed, preview = false,
}: {
  name: string; kind: "image" | "doc"; value: string; onChange: (v: string) => void;
  label: string; needed?: boolean; preview?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isRef = value.startsWith("storage:");

  async function pick(file: File) {
    setError(""); setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file); fd.set("kind", kind);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) setError(j.error ?? "The upload failed.");
      else onChange(j.url);
    } catch { setError("The upload failed. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <p className={labelCls}>{label}{needed && <span className="ml-2 align-middle"><Chip tone="draft">needed</Chip></span>}</p>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-4">
        {preview && value && !isRef && (
          <img src={value} alt="" className="h-20 w-20 rounded-full border-2 border-line object-cover" />
        )}
        {value && isRef && <span className="rounded-xl border-2 border-line bg-mist px-3 py-2 text-sm font-bold">Uploaded · kept private</span>}
        <input
          ref={input} type="file" className="sr-only" id={`${name}-file`}
          accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "application/pdf,.doc,.docx"}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }}
        />
        <label htmlFor={`${name}-file`} className={`${btn("ghost")} cursor-pointer`}>
          {busy ? "Uploading…" : value ? "Replace" : kind === "image" ? "Upload a photo" : "Upload a file"}
        </label>
        {value && !busy && (
          <button type="button" onClick={() => onChange("")} className="text-sm font-bold text-red-800 underline">Remove</button>
        )}
      </div>
      <p className="mt-2 text-xs text-grey">
        {kind === "image" ? "JPEG, PNG or WebP, up to 5MB." : "PDF or Word document, up to 10MB. Only editors can open it."}
      </p>
      {error && <p role="alert" className="mt-1 text-sm font-bold text-red-800">{error}</p>}
    </div>
  );
}
