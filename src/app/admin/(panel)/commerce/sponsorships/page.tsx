import { CommerceNav } from "@/components/CommerceNav";
import { fmtDate } from "@/components/Cards";
import { gbp } from "@/lib/commerce";
import { db } from "@/lib/db";
import { saveSponsorship, updateSponsorship } from "../../../commerce-actions";

const field = "min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm";
export default async function Sponsorships({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const rows = await db.sponsorship.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <CommerceNav active="/admin/commerce/sponsorships" msg={msg} />
      <p className="mb-4 max-w-3xl text-sm text-grey">A ledger of direct-sold sponsorships. <strong>Active</strong> podcast sponsorships show “Sponsored by …” on the episode; active newsletter sponsorships add a labelled block to the digest. Sponsored <em>articles</em> are made in the article editor with a Sponsored/Partner/Advertorial disclosure and the sponsor named.</p>
      <form action={saveSponsorship} className="mb-10 grid max-w-5xl gap-3 sm:grid-cols-4">
        <div><label htmlFor="s-kind" className="block text-sm font-bold">Type</label><select id="s-kind" name="kind" className={field}><option value="PODCAST">Podcast episode</option><option value="NEWSLETTER">Newsletter</option><option value="ARTICLE">Article (record only)</option><option value="OTHER">Other</option></select></div>
        <div><label htmlFor="s-name" className="block text-sm font-bold">Sponsor</label><input id="s-name" name="sponsorName" className={field} /></div>
        <div><label htmlFor="s-web" className="block text-sm font-bold">Website</label><input id="s-web" name="website" className={field} /></div>
        <div><label htmlFor="s-price" className="block text-sm font-bold">Price £ (ex VAT)</label><input id="s-price" name="priceGbp" inputMode="decimal" className={field} /></div>
        <div><label htmlFor="s-ep" className="block text-sm font-bold">Episode slug (podcast)</label><input id="s-ep" name="episodeSlug" className={field} /></div>
        <div><label htmlFor="s-from" className="block text-sm font-bold">From</label><input id="s-from" name="startsAt" type="date" className={field} /></div>
        <div><label htmlFor="s-to" className="block text-sm font-bold">To</label><input id="s-to" name="endsAt" type="date" className={field} /></div>
        <div><label htmlFor="s-status" className="block text-sm font-bold">Status</label><select id="s-status" name="status" className={field}><option value="DRAFT">Draft</option><option value="ACTIVE">Active (live now)</option></select></div>
        <div className="sm:col-span-3"><label htmlFor="s-notes" className="block text-sm font-bold">Notes (shown in newsletter block)</label><input id="s-notes" name="notes" className={field} /></div>
        <div className="flex items-end"><button className="min-h-10 rounded-full bg-ink px-5 font-bold text-yellow">Add</button></div></form>
      {rows.length === 0 ? <p className="text-grey">None yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">Sponsor</th><th>Type</th><th>Price</th><th>Dates</th><th>Status</th><th>Invoiced</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-line"><td className="py-2 font-bold">{r.sponsorName}</td><td>{r.kind}</td><td>{gbp(r.pricePence)}</td><td>{r.startsAt ? fmtDate(r.startsAt) : "—"} → {r.endsAt ? fmtDate(r.endsAt) : "—"}</td><td>{r.status}</td><td>{r.invoiced ? "Yes" : "No"}</td>
              <td className="relative"><form action={updateSponsorship} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={r.id} /><select name="status" defaultValue={r.status} aria-label={`Status for ${r.sponsorName}`} className="min-h-9 rounded border-2 border-line px-1"><option>DRAFT</option><option>ACTIVE</option><option>DONE</option><option>CANCELLED</option></select><button name="invoiced" value={r.invoiced ? "0" : "1"} className="font-bold underline">{r.invoiced ? "Un-invoice" : "Mark invoiced"}</button></form></td></tr>))}</tbody></table></div>
      )}
    </>
  );
}
