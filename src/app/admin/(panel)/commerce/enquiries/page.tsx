import { CommerceNav } from "@/components/CommerceNav";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { assignEnquiryOwner, setEnquiryFollowUp, setEnquiryStatus } from "../../../commerce-actions";

export default async function Enquiries({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const [rows, admins] = await Promise.all([
    db.salesEnquiry.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { assignedTo: { select: { id: true, name: true } } } }),
    db.adminUser.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <CommerceNav active="/admin/commerce/enquiries" msg={msg} />
      {rows.length === 0 ? <p className="text-grey">No enquiries yet.</p> : (
        <ul className="space-y-4">{rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-extrabold">{r.name}{r.company ? ` · ${r.company}` : ""}</p><span className="rounded-full border-2 border-ink px-3 py-0.5 text-xs font-extrabold uppercase">{r.status}</span></div>
            <p className="text-sm text-grey">{fmtDate(r.createdAt)} · {r.interest} · <a className="underline" href={`mailto:${r.email}`}>{r.email}</a></p><p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{r.message}</p>
            <form action={setEnquiryStatus} className="mt-3 flex flex-wrap gap-3 text-sm font-bold"><input type="hidden" name="id" value={r.id} />{(["NEW", "CONTACTED", "WON", "LOST"] as const).filter((s) => s !== r.status).map((s) => <button key={s} name="status" value={s} className="underline">Mark {s.toLowerCase()}</button>)}</form>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <form action={assignEnquiryOwner} className="flex items-center gap-2"><input type="hidden" name="id" value={r.id} /><label className="font-bold">Owner</label><select name="assignedToId" defaultValue={r.assignedToId ?? ""} className="rounded-lg border-2 border-line px-2 py-1"><option value="">Unassigned</option>{admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="underline font-bold">Save</button></form>
              <form action={setEnquiryFollowUp} className="flex items-center gap-2"><input type="hidden" name="id" value={r.id} /><label className="font-bold">Follow up</label><input type="date" name="followUpAt" defaultValue={r.followUpAt ? r.followUpAt.toISOString().slice(0, 10) : ""} className="rounded-lg border-2 border-line px-2 py-1" /><button className="underline font-bold">Save</button></form>
            </div></li>))}</ul>
      )}
    </>
  );
}
