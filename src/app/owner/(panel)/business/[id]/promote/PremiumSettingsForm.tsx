"use client";
import { useActionState, useState } from "react";
import { savePremiumSettings, type CState } from "../../../../commerce-actions";

const field = "min-h-11 w-full rounded-lg border-2 border-line px-3 py-2";
export function PremiumSettingsForm({ id, initial }: { id: string; initial: { gallery: string; promoText: string; promoUrl: string } }) {
  const [s, action, pending] = useActionState<CState, FormData>(savePremiumSettings, {});
  const [f, setF] = useState(initial);
  const e = s.errors ?? {};
  return (
    <form action={action} className="max-w-2xl space-y-4" noValidate>
      <input type="hidden" name="id" value={id} />
      {s.message && <p role={s.ok ? "status" : "alert"} className="rounded-lg border-2 border-ink px-4 py-2 font-bold">{s.ok ? "✓" : "⚠"} {s.message}</p>}
      <div><label htmlFor="gallery" className="mb-1 block font-bold">Gallery images</label><p className="mb-1 text-sm text-grey">One https image address per line, up to 8. Only use photos you have the rights to.</p>
        <textarea id="gallery" name="gallery" rows={5} value={f.gallery} onChange={(ev) => setF({ ...f, gallery: ev.target.value })} className={`${field} font-mono text-sm`} aria-invalid={!!e.gallery} />{e.gallery && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.gallery}</p>}</div>
      <div><label htmlFor="promoText" className="mb-1 block font-bold">Offer / announcement <span className="font-normal text-grey">({f.promoText.length}/140)</span></label>
        <input id="promoText" name="promoText" value={f.promoText} onChange={(ev) => setF({ ...f, promoText: ev.target.value })} className={field} aria-invalid={!!e.promoText} />{e.promoText && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.promoText}</p>}
        <p className="mt-1 text-xs text-grey">Shown on your profile under “Offer from {`{your business}`}”. It must be truthful and not misleading.</p></div>
      <div><label htmlFor="promoUrl" className="mb-1 block font-bold">Offer link (optional)</label><input id="promoUrl" name="promoUrl" value={f.promoUrl} onChange={(ev) => setF({ ...f, promoUrl: ev.target.value })} className={field} />{e.promoUrl && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.promoUrl}</p>}</div>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
