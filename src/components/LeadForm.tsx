"use client";
import { useActionState, useState } from "react";
import { submitLead, type LeadState } from "@/app/businesses/lead-actions";

const field = "min-h-11 w-full rounded-lg border-2 border-line bg-white px-3 py-2";
export function LeadForm({ businessId, businessName, formToken }: { businessId: string; businessName: string; formToken: string }) {
  const [s, action, pending] = useActionState<LeadState, FormData>(submitLead, {});
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "" });
  const e = s.errors ?? {};
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  if (s.ok) return <p role="status" className="rounded-xl border-4 border-ink bg-yellow p-5 font-bold">✓ {s.message}</p>;
  const row = (k: keyof typeof f, label: string, type = "text", el: "input" | "textarea" = "input") => (
    <div><label htmlFor={`lead-${k}`} className="mb-1 block text-sm font-bold">{label}</label>
      {el === "input" ? <input id={`lead-${k}`} name={k} type={type} value={f[k]} onChange={set(k)} className={field} aria-invalid={!!e[k]} /> : <textarea id={`lead-${k}`} name={k} rows={4} value={f[k]} onChange={set(k)} className={field} aria-invalid={!!e[k]} />}
      {e[k] && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e[k]}</p>}</div>
  );
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="business" value={businessId} /><input type="hidden" name="ft" value={formToken} />
      {s.message && <p role="alert" className="rounded-lg border-2 border-red-700 p-3 text-sm font-bold">⚠ {s.message}</p>}
      {row("name", "Your name")}{row("email", "Your email", "email")}{row("phone", "Phone (optional)", "tel")}{row("message", `Your enquiry for ${businessName}`, "text", "textarea")}
      <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="company_site" tabIndex={-1} autoComplete="off" /></label></div>
      <button disabled={pending} className="min-h-11 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal disabled:opacity-60">{pending ? "Sending…" : "Send enquiry"}</button>
      <p className="text-xs text-grey">Your details go only to this business. They&apos;ll reply to your email.</p>
    </form>
  );
}
