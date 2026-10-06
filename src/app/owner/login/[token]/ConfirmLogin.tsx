"use client";
import { useState, useTransition } from "react";
import { consumeLogin } from "../../actions";

export function ConfirmLogin({ token }: { token: string }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <p>Click the button to finish signing in on this device.</p>
      <button disabled={pending} onClick={() => start(async () => { const r = await consumeLogin(token); if (r?.message) setMsg(r.message); })} className="min-h-12 w-full rounded-full bg-ink font-bold text-yellow hover:bg-charcoal">{pending ? "Signing in…" : "Sign in"}</button>
      {msg && <p role="alert" className="font-bold text-red-700">⚠ {msg}</p>}
    </div>
  );
}
