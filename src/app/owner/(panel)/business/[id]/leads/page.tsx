import { OwnerTabs } from "@/components/OwnerTabs";
import { fmtDate } from "@/components/Cards";
import { isPremium } from "@/lib/commerce";
import { db } from "@/lib/db";
import { requireBusiness } from "@/lib/owner";
import { setLeadStatus } from "../../../../commerce-actions";

export default async function Leads({ params }: { params: Promise<{ id: string }> }) {
  const { business: b } = await requireBusiness((await params).id);
  const [premium, leads] = await Promise.all([isPremium(b.id), db.lead.findMany({ where: { businessId: b.id }, orderBy: { createdAt: "desc" }, take: 100 })]);
  return (
    <>
      <OwnerTabs id={b.id} name={b.name} active="leads" />
      {!premium && <p role="note" className="mb-6 rounded-xl border-2 border-dashed border-line p-4">The enquiry form on your profile is a Premium feature. {leads.length > 0 ? "Your earlier enquiries are kept below." : ""}</p>}
      {leads.length === 0 ? <p className="text-grey">No enquiries yet.</p> : (
        <ul className="space-y-4">{leads.map((l) => (
          <li key={l.id} className="rounded-2xl border border-line p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-extrabold">{l.name}</p><span className="rounded-full border-2 border-ink px-3 py-0.5 text-xs font-extrabold uppercase">{l.status}</span></div>
            <p className="text-sm text-grey">{fmtDate(l.createdAt)} · <a className="underline" href={`mailto:${l.email}`}>{l.email}</a>{l.phone ? ` · ${l.phone}` : ""}</p>
            <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{l.message}</p>
            <form action={setLeadStatus} className="mt-3 flex gap-3 text-sm font-bold"><input type="hidden" name="leadId" value={l.id} />
              {l.status !== "READ" && <button name="status" value="READ" className="underline">Mark read</button>}{l.status !== "ARCHIVED" && <button name="status" value="ARCHIVED" className="underline">Archive</button>}{l.status !== "NEW" && <button name="status" value="NEW" className="underline">Mark new</button>}</form></li>))}</ul>
      )}
    </>
  );
}
