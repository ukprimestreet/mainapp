"use client";
import { useActionState, useState } from "react";
import { subscribe, type NlState } from "@/app/newsletter/actions";

export function NewsletterForm({ formToken, source, dark = false }: { formToken: string; source: string; dark?: boolean }) {
  const [s, action, pending] = useActionState<NlState, FormData>(subscribe, {});
  const [email, setEmail] = useState("");
  const id = `nl-${source}`;
  if (s.ok) return <p role="status" className="font-bold">✓ {s.message}</p>;
  return (
    <form action={action} noValidate>
      <input type="hidden" name="ft" value={formToken} /><input type="hidden" name="source" value={source} />
      <div className="flex w-full max-w-md gap-2">
        <label htmlFor={id} className="sr-only">Email address</label>
        <input id={id} name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={!!s.error} aria-describedby={s.error ? `${id}-err` : undefined}
          className={`min-h-12 w-0 min-w-0 flex-1 rounded-full border-2 px-4 ${dark ? "border-white/30 bg-white/10 text-white placeholder:text-white/60" : "border-ink bg-white text-ink"}`} />
        <button disabled={pending} className="min-h-12 rounded-full bg-yellow px-5 font-bold text-ink hover:bg-yellow-hover disabled:opacity-60">{pending ? "…" : "Subscribe"}</button>
      </div>
      <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="fax_number" tabIndex={-1} autoComplete="off" /></label></div>
      {s.error && <p id={`${id}-err`} role="alert" className="mt-2 text-sm font-bold text-red-400">⚠ {s.error}</p>}
      <p className={`mt-2 text-xs ${dark ? "text-white/60" : "text-grey"}`}>One email a week. Unsubscribe any time. See our <a href="/privacy" className="underline">privacy notice</a>.</p>
    </form>
  );
}
