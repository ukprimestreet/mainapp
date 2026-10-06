"use client";
import { useActionState, useState } from "react";
import { submitDispute, type ClaimState } from "../actions";

const field = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 py-2";
export function DisputeForm({ slug }: { slug: string }) {
  const [s, action, pending] = useActionState<ClaimState, FormData>(submitDispute, { ok: false });
  const [f, setF] = useState({ name: "", email: "", role: "", verification: "" });
  const e = s.errors ?? {};
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  if (s.ok) return <div role="status" className="rounded-2xl border-4 border-ink bg-yellow p-8"><h2 className="font-display text-3xl font-extrabold">Report received ✓</h2><p className="mt-2 font-medium">We&apos;ve emailed you a link to follow it. We&apos;ll be in touch if we need more information.</p></div>;
  const row = (id: keyof typeof f, label: string, el: "input" | "textarea" = "input") => (
    <div><label htmlFor={id} className="mb-1 block font-bold">{label}</label>
      {el === "input" ? <input id={id} name={id} value={f[id]} onChange={set(id)} className={field} aria-invalid={!!e[id]} /> : <textarea id={id} name={id} rows={5} value={f[id]} onChange={set(id)} className={field} aria-invalid={!!e[id]} />}
      {e[id] && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e[id]}</p>}</div>
  );
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="business" value={slug} />
      {s.message && <p role="alert" className="rounded-xl border-2 border-red-700 p-4 font-bold">⚠ {s.message}</p>}
      {row("name", "Your name")}{row("email", "Your email")}{row("role", "Your connection to the business")}{row("verification", "Why is the current owner wrong?", "textarea")}
      <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="website_url" tabIndex={-1} autoComplete="off" /></label></div>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow">{pending ? "Sending…" : "Send report"}</button>
    </form>
  );
}
