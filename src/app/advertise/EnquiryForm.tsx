"use client";
import { useActionState, useState } from "react";
import { submitEnquiry, type EnqState } from "./actions";

const field = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 py-2";
export function EnquiryForm({ formToken }: { formToken: string }) {
  const [s, action, pending] = useActionState<EnqState, FormData>(submitEnquiry, {});
  const [f, setF] = useState({ name: "", email: "", company: "", interest: "", message: "" });
  const e = s.errors ?? {};
  if (s.ok) return <p role="status" className="rounded-xl border-4 border-ink bg-yellow p-6 font-bold">✓ {s.message}</p>;
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value });
  const err = (k: string) => e[k] && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e[k]}</p>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="ft" value={formToken} />
      {s.message && <p role="alert" className="rounded-xl border-2 border-red-700 p-3 font-bold">⚠ {s.message}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="enq-name" className="mb-1 block font-bold">Your name</label><input id="enq-name" name="name" value={f.name} onChange={set("name")} className={field} />{err("name")}</div>
        <div><label htmlFor="enq-email" className="mb-1 block font-bold">Email</label><input id="enq-email" name="email" type="email" value={f.email} onChange={set("email")} className={field} />{err("email")}</div>
        <div><label htmlFor="enq-company" className="mb-1 block font-bold">Business / brand (optional)</label><input id="enq-company" name="company" value={f.company} onChange={set("company")} className={field} /></div>
        <div><label htmlFor="enq-interest" className="mb-1 block font-bold">I&apos;m interested in</label><select id="enq-interest" name="interest" value={f.interest} onChange={set("interest")} className={field}><option value="">Select…</option><option value="premium">A premium profile</option><option value="featured">Featured placement</option><option value="advertising">Advertising</option><option value="sponsorship">Podcast / newsletter sponsorship</option><option value="other">Something else</option></select>{err("interest")}</div>
      </div>
      <div><label htmlFor="enq-message" className="mb-1 block font-bold">What do you need?</label><textarea id="enq-message" name="message" rows={5} value={f.message} onChange={set("message")} className={field} />{err("message")}</div>
      <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="fax_site" tabIndex={-1} autoComplete="off" /></label></div>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow hover:bg-charcoal disabled:opacity-60">{pending ? "Sending…" : "Send enquiry"}</button>
    </form>
  );
}
