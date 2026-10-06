"use client";
import { useActionState } from "react";
import { submitClaim, type ClaimState } from "./actions";

type Opt = { slug: string; name: string; area: string };
const field = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 py-2 text-base";

function F({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-bold">{label}</label>
      {hint && <p className="mb-1 text-sm text-grey">{hint}</p>}
      {children}
      {error && <p id={`${id}-err`} className="mt-1 text-sm font-bold text-red-700">⚠ {error}</p>}
    </div>
  );
}

export function ClaimForm({ options, preselected }: { options: Opt[]; preselected: string }) {
  const [state, action, pending] = useActionState<ClaimState, FormData>(submitClaim, { ok: false });
  const err = state.errors ?? {};
  if (state.ok)
    return (
      <div role="status" className="rounded-2xl border-4 border-ink bg-yellow p-8">
        <h2 className="font-display text-3xl font-extrabold">Request received ✓</h2>
        <p className="mt-2 font-medium">{state.message ?? "Now check your email: we have sent a link to confirm your address. Our team then reviews your request by hand and may ask for more information. Nothing changes on the profile until you are approved."}</p>
      </div>
    );
  const v = state.values ?? {};
  const a11y = (id: string) => ({ id, name: id, defaultValue: v[id] ?? (id === "business" ? preselected : undefined), "aria-invalid": !!err[id], "aria-describedby": err[id] ? `${id}-err` : undefined });
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message && !state.ok && <p role="alert" className="rounded-xl border-2 border-red-700 p-4 font-bold">⚠ {state.message}</p>}
      <F id="business" error={err.business} label="Business">
        <select {...a11y("business")} className={field} required>
          <option value="">Select a business…</option>
          {options.map((o) => <option key={o.slug} value={o.slug}>{o.name} — {o.area}</option>)}
        </select>
      </F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F id="name" error={err.name} label="Your name"><input {...a11y("name")} autoComplete="name" className={field} required /></F>
        <F id="role" error={err.role} label="Your role"><input {...a11y("role")} placeholder="e.g. Owner, Director" className={field} required /></F>
        <F id="email" error={err.email} label="Email"><input {...a11y("email")} type="email" autoComplete="email" className={field} required /></F>
        <F id="phone" error={err.phone} label="Phone"><input {...a11y("phone")} type="tel" autoComplete="tel" className={field} required /></F>
      </div>
      <F id="relationship" error={err.relationship} label="Relationship to the business">
        <select {...a11y("relationship")} className={field} required>
          <option value="">Select…</option><option value="owner">Owner</option><option value="director">Director</option><option value="manager">Manager</option><option value="authorised-rep">Authorised representative</option>
        </select>
      </F>
      <F id="verification" error={err.verification} label="How can we verify you?" hint="e.g. a business email address, Companies House number, or someone we can call at the business.">
        <textarea {...a11y("verification")} rows={4} className={field} required />
      </F>
      {/* Honeypot: hidden from people and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="website_url" tabIndex={-1} autoComplete="off" /></label></div>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow hover:bg-charcoal disabled:opacity-60">{pending ? "Sending…" : "Submit claim request"}</button>
      <p className="text-sm text-grey">We never publish your contact details. Claims are reviewed by a person before any access is granted.</p>
    </form>
  );
}
