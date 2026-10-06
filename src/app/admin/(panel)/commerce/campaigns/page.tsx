import { CommerceNav } from "@/components/CommerceNav";
import { fmtDate } from "@/components/Cards";
import { campaignTotals } from "@/lib/commerce";
import { db } from "@/lib/db";
import { createCampaign, setCampaignStatus } from "../../../commerce-actions";

const field = "min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm";
export default async function Campaigns({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const [camps, cats, locs] = await Promise.all([
    db.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { business: true, stats: true }, take: 100 }),
    db.category.findMany({ orderBy: { name: "asc" } }), db.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  const now = new Date();
  return (
    <>
      <CommerceNav active="/admin/commerce/campaigns" msg={msg} />
      <h2 className="mb-2 text-xl font-extrabold">New campaign</h2>
      <p className="mb-3 max-w-3xl text-sm text-grey">Featured campaigns show a business in a labelled “Sponsored” slot on matching category/area pages (max 2 per page, fair rotation). Ads show in one placement, labelled “Advertisement”. Sample businesses can&apos;t be promoted.</p>
      <form action={createCampaign} className="mb-10 grid max-w-5xl gap-3 sm:grid-cols-4">
        <div><label htmlFor="c-kind" className="block text-sm font-bold">Type</label><select id="c-kind" name="kind" className={field}><option value="FEATURED">Featured business</option><option value="AD">Advertisement</option></select></div>
        <div><label htmlFor="c-start" className="block text-sm font-bold">Starts</label><input id="c-start" name="startsAt" type="date" className={field} /></div>
        <div><label htmlFor="c-end" className="block text-sm font-bold">Ends</label><input id="c-end" name="endsAt" type="date" className={field} /></div>
        <div><label htmlFor="c-cap" className="block text-sm font-bold">Impression cap (optional)</label><input id="c-cap" name="impressionCap" inputMode="numeric" className={field} /></div>
        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:col-span-4 sm:grid-cols-3"><legend className="px-1 text-sm font-bold">Featured only</legend>
          <div><label htmlFor="c-slug" className="block text-sm font-bold">Business slug</label><input id="c-slug" name="slug" className={field} /></div>
          <div><label htmlFor="c-cat" className="block text-sm font-bold">Category (blank = any)</label><select id="c-cat" name="categoryId" className={field}><option value="">Any</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label htmlFor="c-loc" className="block text-sm font-bold">Area (blank = any)</label><select id="c-loc" name="locationId" className={field}><option value="">Any</option>{locs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></fieldset>
        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:col-span-4 sm:grid-cols-3"><legend className="px-1 text-sm font-bold">Advertisement only</legend>
          <div><label htmlFor="c-adv" className="block text-sm font-bold">Advertiser</label><input id="c-adv" name="advertiser" className={field} /></div>
          <div><label htmlFor="c-place" className="block text-sm font-bold">Placement</label><select id="c-place" name="placement" className={field}><option value="HOME">Home page</option><option value="ARTICLE">Under articles</option><option value="PODCAST">Podcast episodes</option></select></div>
          <div><label htmlFor="c-link" className="block text-sm font-bold">Destination (https)</label><input id="c-link" name="linkUrl" className={field} /></div>
          <div className="sm:col-span-2"><label htmlFor="c-head" className="block text-sm font-bold">Headline</label><input id="c-head" name="headline" className={field} /></div>
          <div><label htmlFor="c-img" className="block text-sm font-bold">Image (https, optional)</label><input id="c-img" name="imageUrl" className={field} /></div>
          <div className="sm:col-span-3"><label htmlFor="c-body" className="block text-sm font-bold">Body (max 200)</label><input id="c-body" name="body" className={field} /></div></fieldset>
        <div><button className="min-h-10 rounded-full bg-ink px-5 font-bold text-yellow">Create campaign</button></div></form>

      <h2 className="mb-2 text-xl font-extrabold">Campaigns</h2>
      {camps.length === 0 ? <p className="text-grey">None yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">What</th><th>Type</th><th>Status</th><th>Runs</th><th>Impr.</th><th>Clicks</th><th>CTR</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{camps.map((c) => { const t = campaignTotals(c.stats); const live = c.status === "ACTIVE" && c.endsAt >= now; return (
            <tr key={c.id} className="border-b border-line align-top"><td className="py-2 font-bold [overflow-wrap:anywhere]">{c.kind === "FEATURED" ? c.business?.name : `${c.advertiser}: ${c.headline}`}{c.source === "ORDER" && <span className="ml-1 text-xs font-normal text-grey">(paid online)</span>}</td><td>{c.kind}{c.kind === "AD" ? ` · ${c.placement}` : ""}</td><td>{live ? "LIVE" : c.status === "ACTIVE" ? "ENDED" : c.status}</td><td>{fmtDate(c.startsAt)} → {fmtDate(c.endsAt)}</td><td>{t.impressions}{c.impressionCap ? ` / ${c.impressionCap}` : ""}</td><td>{t.clicks}</td><td>{t.ctr}%</td>
              <td className="relative"><form action={setCampaignStatus} className="flex gap-2"><input type="hidden" name="id" value={c.id} />{c.status !== "PAUSED" && <button name="status" value="PAUSED" className="font-bold underline">Pause</button>}{c.status === "PAUSED" && <button name="status" value="ACTIVE" className="font-bold underline">Resume</button>}{c.status !== "ENDED" && <button name="status" value="ENDED" className="font-bold text-red-700 underline">End</button>}</form></td></tr>); })}</tbody></table></div>
      )}
    </>
  );
}
