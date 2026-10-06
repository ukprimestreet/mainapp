import Link from "next/link";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { REPORT_REASONS, REVIEW_STATUS, stars } from "@/lib/reviews";
import { dismissReports, moderateReview, respondToReview } from "../../review-actions";

const TABS = [["pending", "Pending"], ["reported", "Reported"], ["held", "Held"], ["unverified", "Unverified"], ["published", "Published"], ["rejected", "Rejected"]] as const;

export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string }> }) {
  const { tab = "pending", msg } = await searchParams;
  const where = tab === "reported" ? { status: "PUBLISHED", reports: { some: { status: "OPEN" } } } : { status: tab.toUpperCase() };
  const [reviews, counts] = await Promise.all([
    db.review.findMany({ where, orderBy: { createdAt: "asc" }, take: 50, include: { business: true, reports: { where: { status: "OPEN" } } } }),
    Promise.all(TABS.map(([k]) => db.review.count({ where: k === "reported" ? { status: "PUBLISHED", reports: { some: { status: "OPEN" } } } : { status: k.toUpperCase() } }))),
  ]);
  const input = "min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm";
  return (
    <>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-3xl font-extrabold">Reviews</h1><Link href="/admin/outbox" className="text-sm font-bold underline">Email outbox</Link></div>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <nav aria-label="Review status" className="mb-6 flex flex-wrap gap-2">{TABS.map(([k, label], i) => <Link key={k} href={`/admin/reviews?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${tab === k ? "border-ink bg-ink text-yellow" : "border-line"}`}>{label} ({counts[i]})</Link>)}</nav>
      {reviews.length === 0 && <p className="text-grey">Nothing here.</p>}
      <ul className="space-y-5">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-extrabold"><Link className="underline" href={`/admin/businesses/${r.business.id}`}>{r.business.name}</Link> <span className="text-sm font-normal text-grey">({r.business.claimStatus})</span></h2>
              <span className="rounded-full border-2 border-ink px-3 py-0.5 text-xs font-extrabold uppercase">{REVIEW_STATUS[r.status as keyof typeof REVIEW_STATUS] ?? r.status}</span>
            </div>
            <p className="mt-2 text-sm"><span><span className="sr-only">{r.rating} out of 5</span><span aria-hidden>{stars(r.rating)}</span></span> <strong>{r.authorName}</strong> · {r.authorEmail} · {fmtDate(r.createdAt)}{r.editedAt && " · edited"}</p>
            {r.title && <p className="mt-1 font-bold">{r.title}</p>}
            <p className="mt-1 whitespace-pre-line break-words rounded-lg bg-mist p-3 text-sm [overflow-wrap:anywhere]">{r.body}</p>
            {r.flags && <p className="mt-2 text-sm"><strong>Signals:</strong> {r.flags.split(",").map((f) => <span key={f} className="mr-1 inline-block rounded border border-ink px-1.5 text-xs font-bold">⚑ {f}</span>)}</p>}
            {r.moderationNote && <p className="mt-1 text-sm"><strong>Note:</strong> {r.moderationNote}</p>}
            {r.reports.length > 0 && (
              <div className="mt-3 rounded-lg border-2 border-red-700 p-3 text-sm"><p className="font-bold">{r.reports.length} open report{r.reports.length > 1 ? "s" : ""}</p>
                <ul className="list-disc pl-5">{r.reports.map((p) => <li key={p.id}>{REPORT_REASONS[p.reason as keyof typeof REPORT_REASONS] ?? p.reason}{p.reporterType === "BUSINESS" && " (says they're the business — unverified)"}{p.reporterType === "OWNER" && " (VERIFIED OWNER of this business)"}{p.details ? ` — ${p.details}` : ""}</li>)}</ul>
                <form action={dismissReports} className="mt-2"><input type="hidden" name="id" value={r.id} /><button className="font-bold underline">Dismiss reports (keep review)</button></form></div>
            )}
            <form action={moderateReview} className="mt-4 space-y-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="tab" value={tab} />
              <label htmlFor={`n-${r.id}`} className="block text-sm font-bold">Moderator note (required to reject; sent to reviewer)</label>
              <input id={`n-${r.id}`} name="note" className={input} />
              <div className="flex flex-wrap gap-2">
                {r.status === "UNVERIFIED" && <button name="decision" value="VERIFY_EMAIL" className="min-h-10 rounded-full border-2 border-ink px-4 text-sm font-bold">Mark email verified (manual)</button>}
                {r.status !== "PUBLISHED" && r.status !== "UNVERIFIED" && <button name="decision" value="PUBLISH" className="min-h-10 rounded-full bg-ink px-4 text-sm font-bold text-yellow">{r.status === "HELD" ? "Restore" : "Publish"}</button>}
                {r.status === "PUBLISHED" && <button name="decision" value="HOLD" className="min-h-10 rounded-full border-2 border-ink px-4 text-sm font-bold">Hide (hold)</button>}
                {r.status !== "REJECTED" && <button name="decision" value="REJECT" className="min-h-10 rounded-full border-2 border-red-700 px-4 text-sm font-bold text-red-700">Reject</button>}
                <button name="decision" value="DELETE" className="min-h-10 rounded-full px-4 text-sm font-bold text-red-700 underline">Delete</button>
              </div></form>
            {r.status === "PUBLISHED" && (
              <form action={respondToReview} className="mt-4 space-y-2 border-t border-line pt-3"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="tab" value={tab} />
                <label htmlFor={`r-${r.id}`} className="block text-sm font-bold">Business response (public, on behalf of {r.business.name}{r.business.claimStatus === "UNCLAIMED" ? " — claim required first" : ""})</label>
                <textarea id={`r-${r.id}`} name="response" rows={2} defaultValue={r.response ?? ""} className={input} />
                <button className="min-h-10 rounded-full border-2 border-ink px-4 text-sm font-bold">Save response</button></form>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
