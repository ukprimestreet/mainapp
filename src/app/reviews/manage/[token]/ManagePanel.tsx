"use client";
import { useActionState, useState, useTransition } from "react";
import { fieldCls, RField, StarInput } from "@/components/ReviewFields";
import { confirmEmail, deleteReview, editReview, type ManageState } from "./actions";

type R = { rating: number; title: string; body: string; authorName: string; status: string; statusLabel: string };

export function ManagePanel({ token, review }: { token: string; review: R }) {
  const [state, action, pending] = useActionState<ManageState, FormData>(editReview.bind(null, token), {});
  const [msg, setMsg] = useState<ManageState>({});
  const [status, setStatus] = useState(review.status);
  const [f, setF] = useState({ rating: review.rating, title: review.title, body: review.body, authorName: review.authorName });
  const [isPending, start] = useTransition();
  const e = state.errors ?? {};
  const set = (k: "title" | "body" | "authorName") => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  if (msg.deleted) return <p role="status" className="rounded-xl border-4 border-ink bg-yellow p-6 font-bold">{msg.message}</p>;
  return (
    <div className="space-y-8">
      <p className="rounded-xl bg-mist p-4"><strong>Status:</strong> {status === "UNVERIFIED" ? "Awaiting email confirmation" : status === "PENDING" ? "Awaiting moderation" : status === "PUBLISHED" ? "Published" : status === "HELD" ? "Hidden while we check a report" : "Not published"}</p>
      {status === "UNVERIFIED" && (
        <div className="rounded-xl border-4 border-ink bg-yellow p-5"><p className="mb-3 font-bold">Confirm your email address to send this review to our moderators.</p>
          <button disabled={isPending} onClick={() => start(async () => { const r = await confirmEmail(token); setMsg(r); if (r.ok) setStatus("PENDING"); })} className="min-h-12 rounded-full bg-ink px-6 font-bold text-yellow">Confirm my email</button></div>
      )}
      {msg.message && !msg.deleted && <p role="status" className="font-bold">{msg.message}</p>}
      {status !== "REJECTED" && (
        <form action={action} className="space-y-5" noValidate>
          <h2 className="font-display text-2xl font-extrabold">Edit your review</h2>
          {state.message && <p role={state.ok ? "status" : "alert"} className="font-bold">{state.ok ? "✓" : "⚠"} {state.message}</p>}
          <StarInput value={f.rating} onChange={(n) => setF({ ...f, rating: n })} error={e.rating} />
          <RField id="title" label="Headline (optional)" error={e.title}><input id="title" name="title" value={f.title} onChange={set("title")} className={fieldCls} /></RField>
          <RField id="body" label="Your review" error={e.body}><textarea id="body" name="body" rows={6} value={f.body} onChange={set("body")} className={fieldCls} /></RField>
          <RField id="authorName" label="Name to show" error={e.authorName}><input id="authorName" name="authorName" value={f.authorName} onChange={set("authorName")} className={fieldCls} /></RField>
          <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow">Save changes</button>
        </form>
      )}
      <div className="border-t border-line pt-6"><h2 className="mb-2 font-display text-xl font-extrabold">Delete your review</h2><p className="mb-3 text-sm text-grey">This permanently removes your review and your email address from PrimeStreet.</p>
        <button disabled={isPending} onClick={() => { if (confirm("Delete this review permanently?")) start(async () => setMsg(await deleteReview(token))); }} className="min-h-12 rounded-full border-2 border-red-700 px-6 font-bold text-red-700">Delete my review</button></div>
    </div>
  );
}
