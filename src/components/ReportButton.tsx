"use client";
import { useActionState } from "react";
import { reportReview, type ReportState } from "@/app/reviews/actions";
import { REPORT_REASONS } from "@/lib/reasons";

export function ReportButton({ reviewId, formToken }: { reviewId: string; formToken: string }) {
  const [s, action, pending] = useActionState<ReportState, FormData>(reportReview, {});
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-bold text-grey underline">Report this review</summary>
      {s.ok ? <p role="status" className="mt-2 font-bold">✓ {s.message}</p> : (
        <form action={action} className="mt-2 max-w-md space-y-3 rounded-xl border border-line p-4">
          <input type="hidden" name="reviewId" value={reviewId} /><input type="hidden" name="ft" value={formToken} />
          <div><label htmlFor={`reason-${reviewId}`} className="mb-1 block font-bold">Reason</label>
            <select id={`reason-${reviewId}`} name="reason" required defaultValue="" className="min-h-11 w-full rounded-lg border-2 border-line px-2"><option value="" disabled>Select…</option>{Object.entries(REPORT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor={`d-${reviewId}`} className="mb-1 block font-bold">Details (optional)</label><textarea id={`d-${reviewId}`} name="details" rows={2} maxLength={500} className="w-full rounded-lg border-2 border-line p-2" /></div>
          <label className="flex items-center gap-2"><input type="checkbox" name="business" className="h-5 w-5" /> I represent this business</label>
          <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="contact_fax" tabIndex={-1} autoComplete="off" /></label></div>
          {s.message && <p role="alert" className="font-bold text-red-700">⚠ {s.message}</p>}
          <button disabled={pending} className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow">Send report</button>
        </form>
      )}
    </details>
  );
}
