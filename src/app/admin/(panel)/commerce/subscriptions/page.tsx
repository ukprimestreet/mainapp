import { CommerceNav } from "@/components/CommerceNav";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { grantPremium, revokeSubscription } from "../../../commerce-actions";

const field = "min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm";
export default async function Subs({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const subs = await db.subscription.findMany({ orderBy: { createdAt: "desc" }, include: { business: true }, take: 100 });
  return (
    <>
      <CommerceNav active="/admin/commerce/subscriptions" msg={msg} />
      <h2 className="mb-2 text-xl font-extrabold">Grant Premium (invoiced offline / complimentary)</h2>
      <form action={grantPremium} className="mb-8 grid max-w-4xl gap-3 sm:grid-cols-4">
        <div><label htmlFor="g-slug" className="block text-sm font-bold">Business slug</label><input id="g-slug" name="slug" className={field} /></div>
        <div><label htmlFor="g-until" className="block text-sm font-bold">Until</label><input id="g-until" name="until" type="date" className={field} /></div>
        <div className="sm:col-span-2"><label htmlFor="g-note" className="block text-sm font-bold">Note (invoice no. / reason)</label><input id="g-note" name="note" className={field} /></div>
        <div><button className="min-h-10 rounded-full bg-ink px-5 font-bold text-yellow">Grant</button></div></form>
      <h2 className="mb-2 text-xl font-extrabold">Plans</h2>
      {subs.length === 0 ? <p className="text-grey">None yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">Business</th><th>Plan</th><th>Status</th><th>Source</th><th>Period ends</th><th>Note</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{subs.map((s) => (
            <tr key={s.id} className="border-b border-line align-top"><td className="py-2 font-bold">{s.business.name}</td><td>{s.productKey}</td><td>{s.status}{s.cancelAtPeriodEnd ? " (ends at period end)" : ""}</td><td>{s.provider}</td><td>{s.currentPeriodEnd ? fmtDate(s.currentPeriodEnd) : "—"}</td><td className="[overflow-wrap:anywhere]">{s.note}</td>
              <td className="relative">{s.status !== "CANCELED" && <form action={revokeSubscription}><input type="hidden" name="id" value={s.id} /><button className="font-bold text-red-700 underline">End now</button></form>}</td></tr>))}</tbody></table></div>
      )}
    </>
  );
}
