"use client";
import { useActionState, useState } from "react";
import { removeOwnerResponse, reportReviewAsOwner, respondToReviewAsOwner, type OState } from "../../../../actions";
import { REPORT_REASONS } from "@/lib/reasons";

export function ReviewRow({ reviewId, response }: { reviewId: string; response: string }) {
  const [rs, respond, rp] = useActionState<OState, FormData>(respondToReviewAsOwner, {});
  const [ds, remove, dp] = useActionState<OState, FormData>(removeOwnerResponse, {});
  const [ps, report, pp] = useActionState<OState, FormData>(reportReviewAsOwner, {});
  const [text, setText] = useState(response);
  const removed = ds.ok;
  const has = !!response && !removed;
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <form action={respond} className="space-y-2"><input type="hidden" name="reviewId" value={reviewId} />
        <label htmlFor={`resp-${reviewId}`} className="block text-sm font-bold">{has || rs.ok ? "Your public response" : "Reply publicly"}</label>
        <textarea id={`resp-${reviewId}`} name="response" rows={3} value={removed ? "" : text} onChange={(e) => setText(e.target.value)} className="w-full rounded-lg border-2 border-line p-2" placeholder="Thank them, address specifics, stay polite." />
        {rs.message && <p role={rs.ok ? "status" : "alert"} className="text-sm font-bold">{rs.ok ? "✓" : "⚠"} {rs.message}</p>}
        <button disabled={rp} className="min-h-10 rounded-full bg-ink px-5 text-sm font-bold text-yellow">{has || rs.ok ? "Update response" : "Post response"}</button></form>
      {(has || rs.ok) && !removed && <form action={remove}><input type="hidden" name="reviewId" value={reviewId} /><button disabled={dp} className="text-sm font-bold text-red-700 underline">Remove my response</button></form>}
      {ds.message && <p role="status" className="text-sm font-bold">✓ {ds.message}</p>}
      <details className="text-sm"><summary className="cursor-pointer font-bold text-grey underline">Report this review to a moderator</summary>
        {ps.ok ? <p role="status" className="mt-2 font-bold">✓ {ps.message}</p> : (
          <form action={report} className="mt-2 max-w-md space-y-2 rounded-xl border border-line p-4"><input type="hidden" name="reviewId" value={reviewId} />
            <label htmlFor={`rr-${reviewId}`} className="block font-bold">Reason</label>
            <select id={`rr-${reviewId}`} name="reason" defaultValue="" className="min-h-10 w-full rounded-lg border-2 border-line px-2"><option value="" disabled>Select…</option>{Object.entries(REPORT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <label htmlFor={`rd-${reviewId}`} className="block font-bold">Details</label><textarea id={`rd-${reviewId}`} name="details" rows={2} maxLength={500} className="w-full rounded-lg border-2 border-line p-2" />
            {ps.message && <p role="alert" className="font-bold text-red-700">⚠ {ps.message}</p>}
            <button disabled={pp} className="min-h-10 rounded-full border-2 border-ink px-4 font-bold">Send report</button></form>
        )}</details>
    </div>
  );
}
