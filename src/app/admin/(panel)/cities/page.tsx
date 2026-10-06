import Link from "next/link";
import { CITY_STATUS, cityCoverage } from "@/lib/cities";
import { saveCity } from "../../city-actions";

const field = "min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm";
export default async function Cities({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const rows = await cityCoverage();
  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-extrabold">Cities</h1>
      <p className="mb-4 max-w-3xl text-sm text-grey">PrimeStreet covers one city properly before adding another. A city stays <strong>coming soon</strong> — and out of the index — until it has real published businesses and an original intro, so we never ship empty pages to search engines.</p>
      {msg && <p className="mb-6 rounded-xl border-2 border-ink bg-yellow-soft p-3 font-bold">{msg}</p>}

      <div className="mb-10 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">City</th><th>Status</th><th>Areas</th><th>Areas with intro</th><th>Real businesses</th><th>Articles</th><th>Team</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.city.id} className="border-b border-line"><td className="py-2 font-bold">{r.city.name}<span className="block text-xs font-normal text-grey">/{r.city.slug}</span></td>
            <td>{CITY_STATUS[r.city.status as keyof typeof CITY_STATUS] ?? r.city.status}{!r.city.active && <span className="text-grey"> · hidden</span>}</td>
            <td>{r.boroughs}{r.neighbourhoods ? <span className="text-grey"> + {r.neighbourhoods} hoods</span> : null}</td>
            <td>{r.areasWithIntro}</td><td>{r.businesses}</td><td>{r.articles}</td><td>{r.team}</td>
            <td><Link href={`/admin/cities/${r.city.slug}`} className="font-bold underline">Open</Link></td></tr>
        ))}</tbody></table></div>

      <h2 className="mb-2 text-xl font-extrabold">Add a city</h2>
      <form action={saveCity} className="grid max-w-5xl gap-3 sm:grid-cols-3">
        <div><label htmlFor="c-name" className="block text-sm font-bold">Name</label><input id="c-name" name="name" className={field} /></div>
        <div><label htmlFor="c-slug" className="block text-sm font-bold">Web address (blank = from name)</label><input id="c-slug" name="slug" className={field} placeholder="manchester" /></div>
        <div><label htmlFor="c-region" className="block text-sm font-bold">Region</label><input id="c-region" name="region" className={field} placeholder="Greater Manchester" /></div>
        <div><label htmlFor="c-status" className="block text-sm font-bold">Status</label><select id="c-status" name="status" className={field} defaultValue="COMING_SOON">{Object.entries(CITY_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label htmlFor="c-lat" className="block text-sm font-bold">Centre latitude</label><input id="c-lat" name="lat" inputMode="decimal" className={field} /></div>
        <div><label htmlFor="c-lng" className="block text-sm font-bold">Centre longitude</label><input id="c-lng" name="lng" inputMode="decimal" className={field} /></div>
        <div className="sm:col-span-2"><label htmlFor="c-pre" className="block text-sm font-bold">Postcode prefixes (space or comma separated)</label><input id="c-pre" name="prefixes" className={field} placeholder="M OL SK BL WA WN" /><p className="mt-1 text-xs text-grey">Used to work out which city a visitor&apos;s postcode belongs to.</p></div>
        <div><label htmlFor="c-sort" className="block text-sm font-bold">Order</label><input id="c-sort" name="sortOrder" inputMode="numeric" defaultValue="0" className={field} /></div>
        <div className="sm:col-span-3"><label htmlFor="c-intro" className="block text-sm font-bold">Intro (100+ characters before it can launch)</label><textarea id="c-intro" name="intro" rows={3} className="w-full rounded-lg border-2 border-line p-2 text-sm" /></div>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="active" defaultChecked className="h-5 w-5" /> Visible on the site</label>
        <div><button className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow">Add city</button></div>
      </form>
    </>
  );
}
