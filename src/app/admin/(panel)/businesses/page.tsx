import Link from "next/link";
import { db } from "@/lib/db";
import { deleteSampleBusinesses, setPublished } from "../../actions";

export default async function AdminBusinesses({ searchParams }: { searchParams: Promise<{ msg?: string; q?: string }> }) {
  const { msg, q = "" } = await searchParams;
  const items = await db.business.findMany({ where: q ? { name: { contains: q, mode: "insensitive" as const } } : {}, include: { category: true, location: true }, orderBy: { name: "asc" }, take: 200 });
  return (
    <>
      <h1 className="mb-2 text-3xl font-extrabold">Businesses</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <form className="mb-4 flex gap-2" role="search"><label htmlFor="q" className="sr-only">Search</label><input id="q" name="q" defaultValue={q} placeholder="Search by name" className="min-h-11 flex-1 rounded-lg border-2 border-line px-3" /><button className="min-h-11 rounded-full bg-ink px-5 font-bold text-white">Search</button></form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b-2 border-ink"><th className="py-2">Name</th><th>Category</th><th>Area</th><th>Status</th><th>Data</th><th className="relative"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{items.map((b) => (
          <tr key={b.id} className="border-b border-line">
            <td className="py-2 font-bold"><Link className="underline" href={`/admin/businesses/${b.id}`}>{b.name}</Link></td><td>{b.category.name}</td><td>{b.location.name}</td>
            <td>{b.claimStatus}{!b.published && " · UNPUBLISHED"}</td><td>{b.isSample ? "Sample" : "Real"}</td>
            <td><form action={setPublished}><input type="hidden" name="id" value={b.id} /><button name="published" value={b.published ? "0" : "1"} className="underline">{b.published ? "Unpublish" : "Publish"}</button></form></td>
          </tr>))}</tbody></table></div>
      <details className="mt-10 rounded-xl border-2 border-red-700 p-4"><summary className="cursor-pointer font-bold text-red-700">Danger zone</summary>
        <form action={deleteSampleBusinesses} className="mt-3"><p className="mb-3 text-sm">Permanently deletes every business flagged Sample (and their links). Real businesses are never touched. Do this when real data is loaded.</p>
          <button className="min-h-11 rounded-full bg-red-700 px-5 font-bold text-white">Delete all sample businesses</button></form></details>
    </>
  );
}
