"use client";
import { useActionState } from "react";
import { submitBusiness, type SubmitState } from "./actions";

type Opt = { slug: string; name: string };
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

export function SubmitForm({ categories, areas }: { categories: Opt[]; areas: Opt[] }) {
  const [s, action, pending] = useActionState<SubmitState, FormData>(submitBusiness, { ok: false });
  const err = s.errors ?? {}, v = s.values ?? {};
  if (s.ok) return <div role="status" className="rounded-2xl border-4 border-ink bg-yellow p-8"><h2 className="font-display text-3xl font-extrabold">Thanks — we&apos;ll take a look ✓</h2><p className="mt-2 font-medium">We review every suggestion. If it&apos;s a fit, it&apos;ll appear as an unclaimed profile.</p></div>;
  const a = (id: string) => ({ id, name: id, defaultValue: v[id], "aria-invalid": !!err[id], "aria-describedby": err[id] ? `${id}-err` : undefined });
  return (
    <form action={action} className="space-y-5" noValidate>
      {s.message && <p role="alert" className="rounded-xl border-2 border-red-700 p-4 font-bold">⚠ {s.message}</p>}
      <F id="name" error={err.name} label="Business name"><input {...a("name")} className={field} required /></F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F id="category" error={err.category} label="Category"><select {...a("category")} className={field} required><option value="">Select…</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></F>
        <F id="area" error={err.area} label="Area"><select {...a("area")} className={field} required><option value="">Select…</option>{areas.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></F>
      </div>
      <F id="description" error={err.description} label="What does the business do?" hint="In your own words — please don't paste text from other websites."><textarea {...a("description")} rows={4} className={field} required /></F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F id="address" error={err.address} label="Address (optional)"><input {...a("address")} className={field} /></F>
        <F id="postcode" error={err.postcode} label="Postcode (optional)"><input {...a("postcode")} className={field} /></F>
        <F id="phone" error={err.phone} label="Phone (optional)"><input {...a("phone")} type="tel" className={field} /></F>
        <F id="website" error={err.website} label="Website (optional)"><input {...a("website")} className={field} /></F>
      </div>
      <fieldset className="space-y-4 rounded-xl border-2 border-line p-4"><legend className="px-2 font-bold">About you (not published)</legend>
        <F id="submitterName" error={err.submitterName} label="Your name"><input {...a("submitterName")} autoComplete="name" className={field} required /></F>
        <F id="submitterEmail" error={err.submitterEmail} label="Your email"><input {...a("submitterEmail")} type="email" autoComplete="email" className={field} required /></F>
        <label className="flex items-center gap-2"><input type="checkbox" name="isOwner" defaultChecked={v.isOwner === "on"} className="h-5 w-5" /> I own or manage this business</label>
      </fieldset>
      <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="company_url" tabIndex={-1} autoComplete="off" /></label></div>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow hover:bg-charcoal disabled:opacity-60">{pending ? "Sending…" : "Suggest this business"}</button>
    </form>
  );
}
