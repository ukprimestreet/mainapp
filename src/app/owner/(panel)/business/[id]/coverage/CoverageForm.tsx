"use client";
import { useActionState, useState } from "react";
import { submitCoverage, type OState } from "../../../../actions";

const field = "min-h-11 w-full rounded-lg border-2 border-line px-3 py-2";
export function CoverageForm({ id }: { id: string }) {
  const [s, action, pending] = useActionState<OState, FormData>(submitCoverage, {});
  const [f, setF] = useState({ topic: "", details: "" });
  const e = s.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={id} />
      {s.message && <p role={s.ok ? "status" : "alert"} className="rounded-lg border-2 border-ink px-4 py-2 font-bold">{s.ok ? "✓" : "⚠"} {s.message}</p>}
      <div><label htmlFor="topic" className="mb-1 block font-bold">Headline</label><input id="topic" name="topic" value={f.topic} onChange={(ev) => setF({ ...f, topic: ev.target.value })} className={field} />{e.topic && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.topic}</p>}</div>
      <div><label htmlFor="details" className="mb-1 block font-bold">What&apos;s the story?</label><p className="mb-1 text-sm text-grey">A launch, an expansion, a founder journey, an unusual customer. Why would a Londoner care?</p>
        <textarea id="details" name="details" rows={6} value={f.details} onChange={(ev) => setF({ ...f, details: ev.target.value })} className={field} />{e.details && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.details}</p>}</div>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow">{pending ? "Sending…" : "Send pitch"}</button>
    </form>
  );
}
