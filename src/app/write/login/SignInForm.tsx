"use client";

import { useActionState, useState } from "react";
import { authorSignIn, forgotPassword, type FormState } from "../actions";
import { btn, field, labelCls } from "@/components/Dash";

export function SignInForm() {
  const [mode, setMode] = useState<"in" | "forgot">("in");
  const [signin, signinAction, signingIn] = useActionState<FormState, FormData>(authorSignIn, {});
  const [forgot, forgotAction, sending] = useActionState<FormState, FormData>(forgotPassword, {});

  if (mode === "forgot") {
    return (
      <form action={forgotAction} className="mt-6 space-y-4">
        <div>
          <label className={labelCls} htmlFor="f-email">Your email address</label>
          <input id="f-email" name="email" type="email" autoComplete="email" required className={field} />
        </div>
        {forgot.ok && <p className="rounded-xl border-2 border-ink bg-yellow-soft p-3 text-sm font-bold">{forgot.ok}</p>}
        <button className={`${btn()} w-full`} disabled={sending}>{sending ? "Sending…" : "Email me a reset link"}</button>
        <button type="button" onClick={() => setMode("in")} className="w-full text-sm font-bold underline">Back to sign in</button>
      </form>
    );
  }

  return (
    <form action={signinAction} className="mt-6 space-y-4">
      {signin.error && <p role="alert" className="rounded-xl border-2 border-red-700 p-3 text-sm font-bold text-red-800">{signin.error}</p>}
      <div>
        <label className={labelCls} htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={field} />
      </div>
      <button className={`${btn()} w-full`} disabled={signingIn}>{signingIn ? "Signing in…" : "Sign in"}</button>
      <button type="button" onClick={() => setMode("forgot")} className="w-full text-sm font-bold underline">Forgotten your password?</button>
    </form>
  );
}
