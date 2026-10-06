"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { requestLogin, type OState } from "../actions";

export function LoginForm() {
  const [s, action, pending] = useActionState<OState, FormData>(requestLogin, {});
  const [email, setEmail] = useState("");
  if (s.ok) return <div role="status" className="rounded-2xl border-4 border-ink bg-yellow p-6"><h2 className="font-display text-2xl font-extrabold">Check your email ✉</h2><p className="mt-2 font-medium">If that address belongs to a PrimeStreet business owner, a sign-in link is on its way. It works once and expires in 20 minutes.</p></div>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <div><label htmlFor="email" className="mb-1 block font-bold">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-12 w-full rounded-xl border-2 border-line px-3" aria-invalid={!!s.errors?.email} />
        {s.errors?.email && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {s.errors.email}</p>}</div>
      {s.message && <p role="alert" className="font-bold text-red-700">⚠ {s.message}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal disabled:opacity-60">{pending ? "Sending…" : "Email me a sign-in link"}</button>
      <p className="text-sm text-grey">Not an owner yet? <Link href="/claim" className="font-bold underline">Claim your business</Link>.</p>
    </form>
  );
}
