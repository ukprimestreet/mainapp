"use client";
import { useActionState, useState, useTransition } from "react";
import { addClaimInfo, confirmClaimEmail, submitPhoneCode, withdrawClaim, type StatusState } from "../../actions";

type C = { kind: string; status: string; emailVerified: boolean; phoneVerified: boolean; phoneCodeIssued: boolean; domainMatch: boolean; adminNotes: string; email: string };
const LABEL: Record<string, string> = { PENDING: "Under review", NEEDS_INFO: "We need more information", APPROVED: "Approved", REJECTED: "Not approved", WITHDRAWN: "Withdrawn" };
const field = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 py-2";

export function StatusPanel({ token, claim }: { token: string; claim: C }) {
  const [status, setStatus] = useState(claim.status);
  const [emailOk, setEmailOk] = useState(claim.emailVerified);
  const [msg, setMsg] = useState<StatusState>({});
  const [pending, start] = useTransition();
  const [phoneState, phoneAction, phonePending] = useActionState<StatusState, FormData>(submitPhoneCode.bind(null, token), {});
  const [infoState, infoAction, infoPending] = useActionState<StatusState, FormData>(addClaimInfo.bind(null, token), {});
  const open = status === "PENDING" || status === "NEEDS_INFO";
  const dispute = claim.kind === "DISPUTE";

  return (
    <div className="space-y-8">
      <p className="rounded-xl bg-mist p-4"><strong>Status:</strong> {LABEL[status] ?? status}{status === "APPROVED" && !dispute && <> — <a className="font-bold underline" href="/owner/login">sign in to your owner dashboard</a></>}</p>
      {msg.message && <p role="status" className="font-bold">{msg.ok ? "✓" : "⚠"} {msg.message}</p>}
      {claim.adminNotes && <p role="note" className="rounded-xl border-2 border-ink bg-yellow-soft p-4"><strong>From our team:</strong> {claim.adminNotes}</p>}

      {!dispute && open && (
        <section aria-labelledby="proof" className="space-y-4">
          <h2 id="proof" className="font-display text-2xl font-extrabold">Proof of ownership</h2>
          <ul className="space-y-2">
            <li><span aria-hidden>{emailOk ? "✓" : "○"}</span> <strong>Email confirmed</strong> ({claim.email}){!emailOk && <span className="sr-only"> — not yet</span>}</li>
            <li><span aria-hidden>{claim.domainMatch ? "✓" : "○"}</span> <strong>Email is on the business&apos;s own website domain</strong>{claim.domainMatch ? "" : " (not matched — that's fine, we'll use other checks)"}</li>
            <li><span aria-hidden>{claim.phoneVerified || phoneState.ok ? "✓" : "○"}</span> <strong>Phone call-back</strong>{claim.phoneVerified ? "" : " — we may call the business's listed number with a code"}</li>
          </ul>
          {!emailOk && (
            <div className="rounded-xl border-4 border-ink bg-yellow p-5"><p className="mb-3 font-bold">Confirm your email address to continue.</p>
              <button disabled={pending} onClick={() => start(async () => { const r = await confirmClaimEmail(token); setMsg(r); if (r.ok) setEmailOk(true); })} className="min-h-12 rounded-full bg-ink px-6 font-bold text-yellow">Confirm my email</button></div>
          )}
          {claim.phoneCodeIssued && !claim.phoneVerified && !phoneState.ok && (
            <form action={phoneAction} className="rounded-xl border-2 border-line p-5"><label htmlFor="code" className="mb-1 block font-bold">Code we read out to the business&apos;s listed phone number</label>
              <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} className={field} />
              {phoneState.message && <p role="alert" className="mt-2 font-bold text-red-700">⚠ {phoneState.message}</p>}
              <button disabled={phonePending} className="mt-3 min-h-12 rounded-full bg-ink px-6 font-bold text-yellow">Verify code</button></form>
          )}
          {phoneState.ok && <p role="status" className="font-bold">✓ {phoneState.message}</p>}
        </section>
      )}

      {open && (
        <form action={infoAction} className="space-y-3"><h2 className="font-display text-2xl font-extrabold">{status === "NEEDS_INFO" ? "Send us the information we asked for" : "Add more information"}</h2>
          <label htmlFor="info" className="sr-only">Additional information</label>
          <textarea id="info" name="info" rows={4} className={field} />
          {infoState.message && <p role={infoState.ok ? "status" : "alert"} className="font-bold">{infoState.ok ? "✓" : "⚠"} {infoState.message}</p>}
          <button disabled={infoPending} className="min-h-12 rounded-full border-2 border-ink px-6 font-bold">Send</button></form>
      )}

      {open && (
        <div className="border-t border-line pt-6"><button disabled={pending} onClick={() => { if (confirm("Withdraw this request?")) start(async () => { const r = await withdrawClaim(token); setMsg(r); if (r.ok) setStatus("WITHDRAWN"); }); }} className="font-bold text-red-700 underline">Withdraw this request</button></div>
      )}
    </div>
  );
}
