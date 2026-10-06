"use client";
import { useActionState, useState } from "react";
import { fieldCls, RField, StarInput } from "@/components/ReviewFields";
import { submitReview, type ReviewState } from "./actions";

export function ReviewForm({ slug, formToken }: { slug: string; formToken: string }) {
  const [s, action, pending] = useActionState<ReviewState, FormData>(submitReview, { ok: false });
  const [f, setF] = useState({ rating: 0, title: "", body: "", authorName: "", email: "" });
  const e = s.errors ?? {};
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  if (s.ok)
    return (
      <div role="status" className="rounded-2xl border-4 border-ink bg-yellow p-8">
        <h2 className="font-display text-3xl font-extrabold">Check your email ✉</h2>
        <p className="mt-2 font-medium">We&apos;ve sent a link to confirm your email address. Your review goes to our moderators once you confirm, and it isn&apos;t public until they approve it.</p>
      </div>
    );
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="business" value={slug} /><input type="hidden" name="ft" value={formToken} />
      {s.message && <p role="alert" className="rounded-xl border-2 border-red-700 p-4 font-bold">⚠ {s.message}</p>}
      <StarInput value={f.rating} onChange={(n) => setF({ ...f, rating: n })} error={e.rating} />
      <RField id="title" label="Headline (optional)" error={e.title}><input id="title" name="title" value={f.title} onChange={set("title")} className={fieldCls} /></RField>
      <RField id="body" label="Your review" hint={`${f.body.length}/2000 — share what you actually experienced. Please don't include phone numbers, links or other people's personal details.`} error={e.body}>
        <textarea id="body" name="body" rows={6} value={f.body} onChange={set("body")} className={fieldCls} aria-invalid={!!e.body} />
      </RField>
      <div className="grid gap-5 sm:grid-cols-2">
        <RField id="authorName" label="Name to show" hint="First name and initial is fine." error={e.authorName}><input id="authorName" name="authorName" value={f.authorName} onChange={set("authorName")} autoComplete="nickname" className={fieldCls} /></RField>
        <RField id="email" label="Your email" hint="Never shown. Used to confirm you're real." error={e.email}><input id="email" name="email" type="email" value={f.email} onChange={set("email")} autoComplete="email" className={fieldCls} /></RField>
      </div>
      <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="contact_fax" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="rounded-xl bg-mist p-4 text-sm">By submitting you confirm this is your genuine experience, that you have no financial or personal link to the business, and that you haven&apos;t been paid or offered anything for it. Reviews are moderated.</p>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow hover:bg-charcoal disabled:opacity-60">{pending ? "Sending…" : "Submit review"}</button>
    </form>
  );
}
