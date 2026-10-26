"use client";

import { useActionState } from "react";
import { adminSignIn, type AdminAuthState } from "../admin-actions";

const field = "min-h-12 w-full rounded-xl border-2 border-line px-3";

/**
 * Two steps in one form: email and password, then the second factor if the account has one. The password is
 * carried in a hidden field for the second step rather than held in a half-authenticated session, because a
 * valid cookie before the second factor would defeat the point of having one.
 */
export function LoginForm({ legacy }: { legacy: boolean }) {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(adminSignIn, {});

  if (state.needsTotp) {
    return (
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="email" value={state.email ?? ""} />
        <PasswordRelay />
        <p className="text-[15px] text-grey">Enter the six-digit code from your authenticator app.</p>
        <div>
          <label htmlFor="code" className="mb-1 block font-bold">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required
            className={`${field} font-mono tracking-widest`} aria-describedby={state.error ? "err" : undefined} />
          <p className="mt-1.5 text-[13px] text-grey">No phone to hand? A recovery code works here too.</p>
        </div>
        {state.error && <p id="err" role="alert" className="font-bold text-red-700">⚠ {state.error}</p>}
        <button disabled={pending} className="min-h-12 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal disabled:opacity-60">
          {pending ? "Checking…" : "Confirm"}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block font-bold">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} className={field} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block font-bold">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={field}
          aria-describedby={state.error ? "err" : undefined} />
      </div>
      {state.error && <p id="err" role="alert" className="font-bold text-red-700">⚠ {state.error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {legacy && (
        <p className="text-[13px] text-grey">
          The shared admin password still works while individual accounts are being set up. It stops working
          automatically once the first account can sign in.
        </p>
      )}
    </form>
  );
}

/**
 * Keeps the password across the second step without a round trip to the server. The browser will not
 * autofill a hidden field, so it is repopulated from the visible one before submit.
 */
function PasswordRelay() {
  return (
    <>
      <label htmlFor="password" className="mb-1 block font-bold">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required className={field} />
    </>
  );
}
