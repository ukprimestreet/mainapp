"use client";

import { useActionState } from "react";
import { finishRegistration, finishReset, type FormState } from "./actions";
import { btn, field, labelCls } from "@/components/Dash";
import { MIN_PASSWORD } from "@/lib/author-password";

export function SetPasswordForm({ token, email, purpose }: { token: string; email: string; purpose: "INVITE" | "RESET" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(purpose === "INVITE" ? finishRegistration : finishReset, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />
      {state.error && <p role="alert" className="rounded-xl border-2 border-red-700 p-3 text-sm font-bold text-red-800">{state.error}</p>}
      {email && (
        <div>
          <label className={labelCls} htmlFor="shown-email">Your account</label>
          <input id="shown-email" value={email} readOnly className={`${field} bg-mist`} />
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className={field} />
        <p className="mt-1 text-xs text-grey">At least {MIN_PASSWORD} characters. Longer is better than complicated.</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className={field} />
      </div>
      <button className={`${btn()} w-full`} disabled={pending}>{pending ? "Saving…" : purpose === "INVITE" ? "Set password and continue" : "Change password"}</button>
    </form>
  );
}
