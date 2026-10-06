"use client";
import { useActionState, useState } from "react";
import { addRedirect, type SeoState } from "../../../seo-actions";

const field = "min-h-11 w-full rounded-lg border-2 border-line px-3 py-2";
export function RedirectForm() {
  const [s, action, pending] = useActionState<SeoState, FormData>(addRedirect, {});
  const [f, setF] = useState({ from: "", to: "", note: "" });
  return (
    <form action={action} className="grid max-w-3xl gap-3 sm:grid-cols-2" noValidate>
      <div><label htmlFor="from" className="mb-1 block font-bold">From (old path)</label><input id="from" name="from" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} placeholder="/old-page" className={`${field} font-mono text-sm`} /></div>
      <div><label htmlFor="to" className="mb-1 block font-bold">To (new path)</label><input id="to" name="to" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} placeholder="/new-page" className={`${field} font-mono text-sm`} /></div>
      <div className="sm:col-span-2"><label htmlFor="note" className="mb-1 block font-bold">Note (optional)</label><input id="note" name="note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={field} /></div>
      {s.message && <p role={s.ok ? "status" : "alert"} className="font-bold sm:col-span-2">{s.ok ? "✓" : "⚠"} {s.message}</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="min-h-11 rounded-full bg-ink px-6 font-bold text-yellow">Add redirect</button></div>
    </form>
  );
}
