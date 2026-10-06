"use client";
import { useState, useTransition } from "react";
import { unsubscribe, type NlState } from "../../actions";

export function UnsubButton({ token }: { token: string }) {
  const [r, setR] = useState<NlState>({});
  const [pending, start] = useTransition();
  if (r.ok) return <p role="status" className="rounded-xl border-4 border-ink bg-yellow p-6 font-bold">✓ {r.message}</p>;
  return (<div className="space-y-4"><p>Stop receiving the PrimeStreet weekly digest?</p>
    <button disabled={pending} onClick={() => start(async () => setR(await unsubscribe(token)))} className="min-h-12 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal">{pending ? "Working…" : "Yes, unsubscribe me"}</button>
    {r.error && <p role="alert" className="font-bold text-red-700">⚠ {r.error}</p>}</div>);
}
