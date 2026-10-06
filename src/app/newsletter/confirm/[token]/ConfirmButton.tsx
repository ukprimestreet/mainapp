"use client";
import { useState, useTransition } from "react";
import { confirmSubscription, type NlState } from "../../actions";

export function ConfirmButton({ token }: { token: string }) {
  const [r, setR] = useState<NlState>({});
  const [pending, start] = useTransition();
  if (r.ok) return <p role="status" className="rounded-xl border-4 border-ink bg-yellow p-6 font-bold">✓ {r.message}</p>;
  return (<div className="space-y-4"><p>Press the button to confirm you want the PrimeStreet weekly digest.</p>
    <button disabled={pending} onClick={() => start(async () => setR(await confirmSubscription(token)))} className="min-h-12 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal">{pending ? "Confirming…" : "Confirm subscription"}</button>
    {r.error && <p role="alert" className="font-bold text-red-700">⚠ {r.error}</p>}</div>);
}
