"use client";
import { useActionState, useState } from "react";
import { saveProfile, type OState } from "../../../actions";

const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]] as const;
type P = { id: string; summary: string; description: string; phone: string; email: string; website: string; address: string; postcode: string; instagram: string; facebook: string; linkedin: string; imageUrl: string; areasServed: string; founded: string; services: string; hours: Record<string, string> };
const field = "min-h-11 w-full rounded-lg border-2 border-line bg-white px-3 py-2";

function F({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (<div><label htmlFor={id} className="mb-1 block font-bold">{label}</label>{hint && <p className="mb-1 text-sm text-grey">{hint}</p>}{children}{error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {error}</p>}</div>);
}

export function ProfileForm({ initial }: { initial: P }) {
  const [s, action, pending] = useActionState<OState, FormData>(saveProfile, {});
  const [f, setF] = useState(initial);
  const e = s.errors ?? {};
  const set = (k: keyof P) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  const text = (k: Exclude<keyof P, "hours" | "id">, label: string, opts: { hint?: string; type?: string } = {}) => (
    <F id={k} label={label} hint={opts.hint} error={e[k]}><input id={k} name={k} type={opts.type ?? "text"} value={f[k]} onChange={set(k)} className={field} aria-invalid={!!e[k]} aria-describedby={e[k] ? `${k}-err` : undefined} /></F>
  );
  const day = (k: string) => f.hours[k];
  const setDay = (k: string, v: string | undefined) => { const h = { ...f.hours }; if (v === undefined) delete h[k]; else h[k] = v; setF({ ...f, hours: h }); };
  const split = (v: string | undefined) => (v ? v.split("-") : ["09:00", "17:00"]);

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="id" value={f.id} />
      <input type="hidden" name="hours" value={JSON.stringify(f.hours)} />
      <div aria-live="polite">{s.message && <p role={s.ok ? "status" : "alert"} className={`rounded-lg border-2 px-4 py-2 font-bold ${s.ok ? "border-ink bg-yellow" : "border-red-700"}`}>{s.ok ? "✓" : "⚠"} {s.message}</p>}</div>
      <F id="summary" label="One-line summary" hint={`${f.summary.length}/160 — shown on cards and in search results.`} error={e.summary}><input id="summary" name="summary" value={f.summary} onChange={set("summary")} className={field} aria-invalid={!!e.summary} /></F>
      <F id="description" label="About your business" hint="In your own words. Please don't paste text from other sites." error={e.description}><textarea id="description" name="description" rows={7} value={f.description} onChange={set("description")} className={field} aria-invalid={!!e.description} /></F>
      <div className="grid gap-4 sm:grid-cols-2">{text("phone", "Phone", { type: "tel" })}{text("website", "Website")}{text("address", "Street address")}{text("postcode", "Postcode")}</div>
      {text("email", "Contact email (private)", { hint: "Never shown publicly.", type: "email" })}
      <fieldset className="space-y-4 rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Services and area</legend>
        {text("services", "Services", { hint: "Separate with commas, e.g. Deep cleans, Office cleaning" })}
        {text("areasServed", "Areas served")}{text("founded", "Year founded")}
      </fieldset>
      <fieldset className="rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Opening hours</legend>
        <ul className="space-y-2">{DAYS.map(([k, name]) => {
          const open = day(k) !== undefined; const [from, to] = split(day(k));
          return (
            <li key={k} className="grid grid-cols-[7.5rem_auto_1fr] items-center gap-3 max-sm:grid-cols-1">
              <span className="font-bold">{name}</span>
              <label className="flex items-center gap-2"><input type="checkbox" checked={open} onChange={(ev) => setDay(k, ev.target.checked ? "09:00-17:00" : undefined)} className="h-5 w-5" /> Open</label>
              {open ? (
                <span className="flex items-center gap-2"><label className="sr-only" htmlFor={`${k}-from`}>{name} opens</label><input id={`${k}-from`} type="time" value={from} onChange={(ev) => setDay(k, `${ev.target.value}-${to}`)} className={`${field} !w-auto`} />
                  <span aria-hidden>–</span><label className="sr-only" htmlFor={`${k}-to`}>{name} closes</label><input id={`${k}-to`} type="time" value={to} onChange={(ev) => setDay(k, `${from}-${ev.target.value}`)} className={`${field} !w-auto`} /></span>
              ) : <span className="text-grey">Closed</span>}
            </li>);
        })}</ul>
        {e.hours && <p role="alert" className="mt-2 text-sm font-bold text-red-700">⚠ {e.hours}</p>}
      </fieldset>
      <fieldset className="space-y-4 rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">Links and image</legend>
        <div className="grid gap-4 sm:grid-cols-2">{text("instagram", "Instagram address")}{text("facebook", "Facebook address")}{text("linkedin", "LinkedIn address")}</div>
        {text("imageUrl", "Image address (https)", { hint: "A landscape photo you have the rights to use." })}
      </fieldset>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow hover:bg-charcoal disabled:opacity-60">{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}
