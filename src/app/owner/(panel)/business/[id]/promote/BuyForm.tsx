"use client";
import { useActionState } from "react";
import { buyProduct, requestProduct, type CState } from "../../../../commerce-actions";

export function BuyForm({ id, product, online, disabled }: { id: string; product: string; online: boolean; disabled: boolean }) {
  const [s, action, pending] = useActionState<CState, FormData>(online ? buyProduct : requestProduct, {});
  if (disabled) return <p className="text-sm font-bold">✓ You&apos;re on this plan.</p>;
  if (s.ok) return <p role="status" className="font-bold">✓ {s.message}</p>;
  return (
    <form action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="product" value={product} />
      <button disabled={pending} className="min-h-11 rounded-full bg-yellow px-5 font-bold hover:bg-yellow-hover disabled:opacity-60">{pending ? "Please wait…" : online ? "Buy online" : "Request this"}</button>
      {s.message && !s.ok && <p role="alert" className="mt-2 text-sm font-bold text-red-700">⚠ {s.message}</p>}
      {!online && <p className="mt-1 text-xs text-grey">We&apos;ll email you an invoice or payment link.</p>}</form>
  );
}
