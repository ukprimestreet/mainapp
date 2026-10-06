import Link from "next/link";
import { notFound } from "next/navigation";
import { CITY_STATUS, EDITOR_ROLES } from "@/lib/cities";
import { db } from "@/lib/db";
import { MIN_INTRO_CHARS } from "@/lib/seo-engine";
import { saveArea, saveCity, setTeam } from "../../../city-actions";

const field = "min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm";
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string }> };

export default async function CityDetail({ params, searchParams }: P) {
  const { slug } = await params; const { msg } = await searchParams;
  const city = await db.city.findUnique({ where: { slug } });
  if (!city) notFound();
  const [areas, team, authors, real] = await Promise.all([
    db.location.findMany({ where: { cityId: city.id }, include: { parent: true, _count: { select: { businesses: true } } }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.cityEditor.findMany({ where: { cityId: city.id }, include: { author: true } }),
    db.author.findMany({ orderBy: { name: "asc" } }),
    db.business.count({ where: { cityId: city.id, published: true, isSample: false } }),
  ]);
  const boroughs = areas.filter((a) => a.kind === "BOROUGH");
  const canLaunch = real > 0 && (city.intro ?? "").length >= MIN_INTRO_CHARS;
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/cities" className="font-bold underline">← All cities</Link></p>
      <h1 className="mb-1 font-display text-3xl font-extrabold">{city.name}</h1>
      <p className="mb-4 text-sm text-grey">{CITY_STATUS[city.status as keyof typeof CITY_STATUS] ?? city.status} · <Link href={`/locations/${city.slug}`} className="underline">view public page</Link></p>
      {msg && <p className="mb-6 rounded-xl border-2 border-ink bg-yellow-soft p-3 font-bold">{msg}</p>}
      {city.status !== "LIVE" && (
        <p className="mb-6 rounded-xl border-2 border-line p-3 text-sm">{canLaunch
          ? "Ready to launch: it has real businesses and an intro. Set the status to Live below."
          : `Not ready to launch yet — needs ${real === 0 ? "at least one real published business" : ""}${real === 0 && (city.intro ?? "").length < MIN_INTRO_CHARS ? " and " : ""}${(city.intro ?? "").length < MIN_INTRO_CHARS ? `an intro of ${MIN_INTRO_CHARS}+ characters` : ""}.`}</p>
      )}

      <h2 className="mb-2 text-xl font-extrabold">City details</h2>
      <form action={saveCity} className="mb-10 grid max-w-5xl gap-3 sm:grid-cols-3"><input type="hidden" name="id" value={city.id} />
        <div><label htmlFor="e-name" className="block text-sm font-bold">Name</label><input id="e-name" name="name" defaultValue={city.name} className={field} /></div>
        <div><label htmlFor="e-slug" className="block text-sm font-bold">Web address</label><input id="e-slug" name="slug" defaultValue={city.slug} className={field} /><p className="mt-1 text-xs text-grey">Changing this adds a redirect from the old address.</p></div>
        <div><label htmlFor="e-region" className="block text-sm font-bold">Region</label><input id="e-region" name="region" defaultValue={city.region ?? ""} className={field} /></div>
        <div><label htmlFor="e-status" className="block text-sm font-bold">Status</label><select id="e-status" name="status" defaultValue={city.status} className={field}>{Object.entries(CITY_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label htmlFor="e-lat" className="block text-sm font-bold">Centre latitude</label><input id="e-lat" name="lat" defaultValue={city.lat ?? ""} inputMode="decimal" className={field} /></div>
        <div><label htmlFor="e-lng" className="block text-sm font-bold">Centre longitude</label><input id="e-lng" name="lng" defaultValue={city.lng ?? ""} inputMode="decimal" className={field} /></div>
        <div className="sm:col-span-2"><label htmlFor="e-pre" className="block text-sm font-bold">Postcode prefixes</label><input id="e-pre" name="prefixes" defaultValue={(JSON.parse(city.postcodePrefixes ?? "[]") as string[]).join(" ")} className={field} /></div>
        <div><label htmlFor="e-sort" className="block text-sm font-bold">Order</label><input id="e-sort" name="sortOrder" defaultValue={city.sortOrder} inputMode="numeric" className={field} /></div>
        <div className="sm:col-span-3"><label htmlFor="e-intro" className="block text-sm font-bold">Intro ({(city.intro ?? "").length} characters)</label><textarea id="e-intro" name="intro" defaultValue={city.intro ?? ""} rows={4} className="w-full rounded-lg border-2 border-line p-2 text-sm" /></div>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="active" defaultChecked={city.active} className="h-5 w-5" /> Visible on the site</label>
        <div><button className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow">Save city</button></div>
      </form>

      <h2 className="mb-2 text-xl font-extrabold">Who covers {city.name}</h2>
      <ul className="mb-4 space-y-2">{team.length === 0 ? <li className="text-sm text-grey">Nobody assigned yet. City hubs only show a team once someone is named.</li> : team.map((t) => (
        <li key={t.authorId} className="flex flex-wrap items-center gap-3 text-sm"><span className="font-bold">{t.author.name}</span><span className="text-grey">{EDITOR_ROLES[t.role as keyof typeof EDITOR_ROLES] ?? t.role}</span>
          <form action={setTeam}><input type="hidden" name="cityId" value={city.id} /><input type="hidden" name="authorId" value={t.authorId} /><input type="hidden" name="remove" value="1" /><button className="font-bold text-red-700 underline">Remove</button></form></li>
      ))}</ul>
      <form action={setTeam} className="mb-10 flex max-w-3xl flex-wrap items-end gap-3"><input type="hidden" name="cityId" value={city.id} />
        <div><label htmlFor="t-author" className="block text-sm font-bold">Writer</label><select id="t-author" name="authorId" className={field}><option value="">Choose…</option>{authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div><label htmlFor="t-role" className="block text-sm font-bold">Role</label><select id="t-role" name="role" className={field}>{Object.entries(EDITOR_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <button className="min-h-11 rounded-full border-2 border-ink px-5 font-bold">Add to team</button>
      </form>

      <h2 className="mb-2 text-xl font-extrabold">Areas ({areas.length})</h2>
      <div className="mb-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">Area</th><th>Type</th><th>Inside</th><th>Businesses</th><th>Intro</th></tr></thead>
        <tbody>{areas.map((a) => (
          <tr key={a.id} className="border-b border-line"><td className="py-2 font-bold">{a.name}<span className="block text-xs font-normal text-grey">/{a.slug}</span></td><td>{a.kind === "NEIGHBOURHOOD" ? "Neighbourhood" : "Borough"}</td><td>{a.parent?.name ?? "—"}</td><td>{a._count.businesses}</td><td>{(a.intro ?? "").length ? `${(a.intro ?? "").length} chars` : <span className="text-grey">none</span>}</td></tr>
        ))}</tbody></table></div>

      <h3 className="mb-2 font-bold">Add an area</h3>
      <form action={saveArea} className="grid max-w-5xl gap-3 sm:grid-cols-3"><input type="hidden" name="cityId" value={city.id} />
        <div><label htmlFor="a-name" className="block text-sm font-bold">Name</label><input id="a-name" name="name" className={field} /></div>
        <div><label htmlFor="a-slug" className="block text-sm font-bold">Web address (blank = from name)</label><input id="a-slug" name="slug" className={field} /></div>
        <div><label htmlFor="a-kind" className="block text-sm font-bold">Type</label><select id="a-kind" name="kind" className={field}><option value="BOROUGH">Borough / district</option><option value="NEIGHBOURHOOD">Neighbourhood</option></select></div>
        <div><label htmlFor="a-parent" className="block text-sm font-bold">Inside which borough (neighbourhoods only)</label><select id="a-parent" name="parentId" className={field}><option value="">—</option>{boroughs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="sm:col-span-3"><label htmlFor="a-intro" className="block text-sm font-bold">Intro (needed before the area page can be indexed)</label><textarea id="a-intro" name="intro" rows={3} className="w-full rounded-lg border-2 border-line p-2 text-sm" /></div>
        <div><button className="min-h-11 rounded-full bg-ink px-5 font-bold text-yellow">Add area</button></div>
      </form>
    </>
  );
}
