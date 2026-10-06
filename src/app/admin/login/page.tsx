"use client";
import { useActionState } from "react";
import { login } from "../actions";
import { Wordmark } from "@/components/Brand";

export default function Login() {
  const [state, action, pending] = useActionState(login, {} as { error?: string });
  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <meta name="robots" content="noindex,nofollow" />
      <Wordmark className="text-4xl" />
      <h1 className="mt-6 text-2xl font-extrabold">Admin sign in</h1>
      <form action={action} className="mt-6 space-y-4">
        <div><label htmlFor="email" className="mb-1 block font-bold">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required className="min-h-12 w-full rounded-xl border-2 border-line px-3" /></div>
        <div><label htmlFor="password" className="mb-1 block font-bold">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="min-h-12 w-full rounded-xl border-2 border-line px-3" aria-describedby={state.error ? "err" : undefined} /></div>
        {state.error && <p id="err" role="alert" className="font-bold text-red-700">⚠ {state.error}</p>}
        <button disabled={pending} className="min-h-12 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal disabled:opacity-60">{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
