"use client";
import { useState } from "react";

export function CopyBox({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  const id = `copy-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div><label htmlFor={id} className="mb-1 block text-sm font-bold">{label}</label>
      <textarea id={id} readOnly rows={5} value={text} className="w-full rounded-lg border-2 border-line p-2 text-sm" />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }} className="mt-1 min-h-10 rounded-full border-2 border-ink px-4 text-sm font-bold">{done ? "Copied ✓" : "Copy"}</button></div>
  );
}
