import { db } from "@/lib/db";
import { fmtDate } from "@/components/Cards";
import { decideSubmission } from "../../actions";

export default async function Submissions({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const subs = await db.businessSubmission.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <h1 className="mb-2 text-3xl font-extrabold">Business submissions</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      {subs.length === 0 && <p className="text-grey">No submissions yet.</p>}
      <ul className="space-y-5">
        {subs.map((s) => (
          <li key={s.id} className="rounded-2xl border border-line p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-extrabold">{s.name}</h2>
              <span className="rounded-full border-2 border-ink px-3 py-0.5 text-xs font-extrabold uppercase">{s.status}</span></div>
            <p className="text-sm text-grey">{s.category} · {s.area} · {fmtDate(s.createdAt)}</p>
            <p className="mt-2 text-sm">{s.description}</p>
            <p className="mt-2 text-sm text-grey">{[s.address, s.postcode, s.phone, s.website].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 text-sm"><strong>Submitted by:</strong> {s.submitterName} ({s.submitterEmail}) — {s.isOwner ? "says they own it" : "third party"}</p>
            {s.status === "PENDING" && (
              <form action={decideSubmission} className="mt-3 flex gap-2"><input type="hidden" name="id" value={s.id} />
                <button name="decision" value="APPROVE" className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow">Approve → create unclaimed profile</button>
                <button name="decision" value="REJECT" className="min-h-11 rounded-full border-2 border-red-700 px-5 font-bold text-red-700">Reject</button></form>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
