import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/queries";
import { updateBusiness } from "../../../actions";
import { revokeOwnership } from "../../../claim-actions";

const f = "min-h-11 w-full rounded-lg border-2 border-line px-3 py-2";
export default async function EditBusiness({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const b = await db.business.findUnique({ where: { id }, include: { owners: { include: { owner: true } } } });
  if (!b) notFound();
  const L = ({ n, label, children }: { n: string; label: string; children: React.ReactNode }) => <div><label htmlFor={n} className="mb-1 block font-bold">{label}</label>{children}</div>;
  return (
    <>
      <h1 className="mb-1 text-3xl font-extrabold">Edit: {b.name}</h1>
      <p className="mb-4 text-sm text-grey">{b.claimStatus} · {b.isSample ? "Sample data" : "Real"} · source: {b.source ?? "—"}</p>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <form action={updateBusiness} className="max-w-2xl space-y-4">
        <input type="hidden" name="id" value={b.id} />
        <L n="name" label="Name"><input id="name" name="name" defaultValue={b.name} className={f} required /></L>
        <L n="slug" label="URL slug (changing it creates a permanent redirect from the old URL)"><input id="slug" name="slug" defaultValue={b.slug} className={`${f} font-mono text-sm`} /></L>
        <L n="summary" label="Summary (max 160)"><input id="summary" name="summary" defaultValue={b.summary} className={f} required /></L>
        <L n="description" label="Description (original text only)"><textarea id="description" name="description" rows={6} defaultValue={b.description} className={f} required /></L>
        <div className="grid gap-4 sm:grid-cols-2">
          <L n="phone" label="Phone"><input id="phone" name="phone" defaultValue={b.phone ?? ""} className={f} /></L>
          <L n="website" label="Website"><input id="website" name="website" defaultValue={b.website ?? ""} className={f} /></L>
          <L n="address" label="Address"><input id="address" name="address" defaultValue={b.address ?? ""} className={f} /></L>
          <L n="postcode" label="Postcode"><input id="postcode" name="postcode" defaultValue={b.postcode ?? ""} className={f} /></L>
        </div>
        <L n="imageUrl" label="Image URL (https)"><input id="imageUrl" name="imageUrl" defaultValue={b.imageUrl ?? ""} className={f} /></L>
        <L n="services" label="Services (comma separated)"><input id="services" name="services" defaultValue={parseJson<string[]>(b.services, []).join(", ")} className={f} /></L>
        <L n="hours" label='Opening hours (JSON, e.g. {"mon":"09:00-17:00"})'><textarea id="hours" name="hours" rows={2} defaultValue={b.openingHours ?? ""} className={`${f} font-mono text-sm`} /></L>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="ownedByFounder" defaultChecked={b.ownedByFounder} className="h-5 w-5" /> Owned by PrimeStreet's founder (adds a reader disclosure to any article featuring it)</label>
        <button className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow">Save changes</button>
      </form>
      <section className="mt-12 max-w-2xl border-t border-line pt-6"><h2 className="mb-2 text-xl font-extrabold">Owners</h2>
        {b.owners.length === 0 ? <p className="text-grey">No one manages this profile.</p> : (
          <>
            <ul className="mb-4 list-disc pl-5">{b.owners.map((o) => <li key={o.ownerId}>{o.owner.name} — {o.owner.email} <span className="text-sm text-grey">({o.role})</span></li>)}</ul>
            <form action={revokeOwnership} className="flex flex-wrap items-end gap-2"><input type="hidden" name="businessId" value={b.id} /><input type="hidden" name="to" value={`/admin/businesses/${b.id}`} />
              <div className="min-w-60 flex-1"><label htmlFor="reason" className="block text-sm font-bold">Revoke all ownership — reason (emailed to them)</label><input id="reason" name="reason" className="min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm" /></div>
              <button className="min-h-10 rounded-full border-2 border-red-700 px-4 text-sm font-bold text-red-700">Revoke ownership</button></form>
          </>
        )}</section>
    </>
  );
}
