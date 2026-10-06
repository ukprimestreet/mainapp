"use client";
import { useActionState, useState } from "react";
import { requestChange, type OState } from "../../../actions";

export function ChangeRequestForm({ id }: { id: string }) {
  const [s, action, pending] = useActionState<OState, FormData>(requestChange, {});
  const [m, setM] = useState("");
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="message" className="sr-only">Describe the change you need</label>
      <textarea id="message" name="message" rows={3} value={m} onChange={(e) => setM(e.target.value)} placeholder="e.g. We've rebranded to …" className="w-full rounded-lg border-2 border-line p-2 text-sm" />
      {s.errors?.message && <p role="alert" className="text-sm font-bold text-red-700">⚠ {s.errors.message}</p>}
      {s.message && <p role={s.ok ? "status" : "alert"} className="text-sm font-bold">{s.ok ? "✓" : "⚠"} {s.message}</p>}
      <button disabled={pending} className="min-h-10 rounded-full border-2 border-ink px-4 text-sm font-bold">Request change</button>
    </form>
  );
}
