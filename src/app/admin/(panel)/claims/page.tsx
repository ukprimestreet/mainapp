import Link from "next/link";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { claimEvidence } from "@/lib/owner";
import { bizPath } from "@/lib/queries";
import { decideClaim, generatePhoneCode, resolveDispute, revokeOwnership } from "../../claim-actions";

const tick = (ok: boolean, yes: string, no: string) => <li><span aria-hidden>{ok ? "✓" : "○"}</span> <span className="sr-only">{ok ? "Yes: " : "No: "}</span>{ok ? yes : no}</li>;

export default async function Claims({ searchParams }: { searchParams: Promise<{ msg?: string; show?: string }> }) {
  const { msg, show = "open" } = await searchParams;
  const open = { in: ["PENDING", "NEEDS_INFO"] };
  const claims = await db.claimRequest.findMany({
    where: show === "all" ? {} : { status: open }, orderBy: { createdAt: "desc" }, take: 100,
    include: { business: { include: { category: true, city: true, owners: { include: { owner: true } } } } },
  });
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">Claims &amp; disputes</h1>
        <p className="text-sm font-bold"><Link href="/admin/claims" className={show === "open" ? "underline" : ""}>Open</Link> · <Link href="/admin/claims?show=all" className={show === "all" ? "underline" : ""}>All</Link></p></div>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      {claims.length === 0 && <p className="text-grey">Nothing {show === "all" ? "yet" : "open"}.</p>}
      <ul className="space-y-5">
        {claims.map((c) => {
          const ev = claimEvidence(c);
          const isOpen = c.status === "PENDING" || c.status === "NEEDS_INFO";
          const b = c.business;
          return (
            <li key={c.id} className="rounded-2xl border border-line p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-extrabold">{c.kind === "DISPUTE" && <span className="mr-2 rounded bg-yellow px-2 py-0.5 text-xs font-extrabold uppercase">Dispute</span>}<Link className="underline" href={bizPath(b)}>{b.name}</Link> <span className="text-sm font-normal text-grey">({b.claimStatus})</span></h2>
                <span className="rounded-full border-2 border-ink px-3 py-0.5 text-xs font-extrabold uppercase">{c.status.replace("_", " ")}</span>
              </div>
              <p className="mt-1 text-sm text-grey">{fmtDate(c.createdAt)}</p>
              <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                <div><dt className="inline font-bold">Name: </dt><dd className="inline">{c.name}</dd></div>
                <div><dt className="inline font-bold">Role: </dt><dd className="inline">{c.role} ({c.relationship})</dd></div>
                <div><dt className="inline font-bold">Email: </dt><dd className="inline">{c.email}</dd></div>
                {c.kind === "CLAIM" && <div><dt className="inline font-bold">Claimant phone: </dt><dd className="inline">{c.phone}</dd></div>}
              </dl>
              {c.kind === "CLAIM" && (
                <div className="mt-3 rounded-lg bg-mist p-3 text-sm"><p className="mb-1 font-bold">Evidence</p>
                  <ul className="space-y-0.5">
                    {tick(!!c.emailVerifiedAt, "Email confirmed by claimant", "Email NOT confirmed — can't approve yet")}
                    {tick(c.domainMatch, `Email is on the business's website domain${b.websiteHost ? ` (${b.websiteHost})` : ""}`, "Email isn't on the business's website domain")}
                    {tick(!!c.phoneVerifiedAt, "Phone call-back code verified", c.phoneCodeHash ? `Phone code issued, not yet entered (${c.phoneAttempts} wrong attempts)` : "No phone call-back done")}
                  </ul>
                  <p className="mt-2 text-xs">Listed business phone: <strong>{b.phone ?? "none on file"}</strong> — call <em>this</em> number, not the claimant&apos;s.</p>
                </div>
              )}
              <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-mist p-3 text-sm [overflow-wrap:anywhere]"><strong>{c.kind === "DISPUTE" ? "Why they say the owner is wrong:" : "Claimant's evidence:"}</strong> {c.verification}</p>
              {c.adminNotes && <p className="mt-2 text-sm"><strong>Notes:</strong> {c.adminNotes}</p>}

              {isOpen && c.kind === "CLAIM" && (
                <div className="mt-4 space-y-3">
                  <form action={generatePhoneCode}><input type="hidden" name="id" value={c.id} /><button className="min-h-10 rounded-full border-2 border-ink px-4 text-sm font-bold">{c.phoneCodeHash ? "Issue a new phone code" : "Issue phone call-back code"}</button></form>
                  <form action={decideClaim} className="space-y-3">
                    <input type="hidden" name="id" value={c.id} />
                    <label className="block text-sm font-bold" htmlFor={`n-${c.id}`}>Notes (required to reject / request info; sent to the claimant)</label>
                    <textarea id={`n-${c.id}`} name="notes" rows={2} className="w-full rounded-lg border-2 border-line p-2 text-sm" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" disabled={!ev.canVerify} /> Mark as <strong>Verified</strong>{!ev.canVerify && " (needs a business-domain email or phone call-back)"}</label>
                    <div className="flex flex-wrap gap-2">
                      <button name="decision" value="APPROVE" className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow">Approve{ev.canApprove ? "" : " (blocked: email unconfirmed)"}</button>
                      <button name="decision" value="NEEDS_INFO" className="min-h-11 rounded-full border-2 border-ink px-5 font-bold">Request more info</button>
                      <button name="decision" value="REJECT" className="min-h-11 rounded-full border-2 border-red-700 px-5 font-bold text-red-700">Reject</button>
                    </div>
                  </form>
                </div>
              )}
              {isOpen && c.kind === "DISPUTE" && (
                <form action={resolveDispute} className="mt-4 space-y-2"><input type="hidden" name="id" value={c.id} />
                  <label className="block text-sm font-bold" htmlFor={`d-${c.id}`}>Outcome note (emailed to the reporter)</label><textarea id={`d-${c.id}`} name="notes" rows={2} className="w-full rounded-lg border-2 border-line p-2 text-sm" />
                  <p className="text-sm">Current owner(s): {b.owners.map((o) => o.owner.email).join(", ") || "none"}</p>
                  <div className="flex gap-2"><button name="decision" value="UPHOLD" className="min-h-10 rounded-full bg-ink px-4 text-sm font-bold text-yellow">Uphold dispute</button><button name="decision" value="DISMISS" className="min-h-10 rounded-full border-2 border-ink px-4 text-sm font-bold">Dismiss</button></div></form>
              )}
              {c.kind === "DISPUTE" && b.owners.length > 0 && (
                <form action={revokeOwnership} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"><input type="hidden" name="businessId" value={b.id} /><input type="hidden" name="to" value="/admin/claims" />
                  <div className="min-w-60 flex-1"><label htmlFor={`rv-${c.id}`} className="block text-sm font-bold">Revoke current ownership — reason</label><input id={`rv-${c.id}`} name="reason" className="min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm" /></div>
                  <button className="min-h-10 rounded-full border-2 border-red-700 px-4 text-sm font-bold text-red-700">Revoke ownership</button></form>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
