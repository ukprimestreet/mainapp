"use client";

import { useActionState } from "react";
import { adminSetPassword, type AdminAuthState } from "../../admin-actions";

const field = "min-h-12 w-full rounded-xl border-2 border-line px-3";

export function SetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(adminSetPassword, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="mb-1 block font-bold">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required className={field}
          aria-describedby={state.error ? "err" : undefined} />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block font-bold">Confirm it</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={field} />
      </div>
      {state.error && <p id="err" role="alert" className="font-bold text-red-700">⚠ {state.error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal disabled:opacity-60">
        {pending ? "Saving…" : "Set my password"}
      </button>
      <p className="text-[13px] text-grey">Setting a password signs you out of any other device, on purpose.</p>
    </form>
  );
}
