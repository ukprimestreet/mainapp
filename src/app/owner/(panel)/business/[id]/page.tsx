import { OwnerTabs } from "@/components/OwnerTabs";
import { completeness, requireBusiness } from "@/lib/owner";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/queries";
import { ProfileForm } from "./ProfileForm";
import { ChangeRequestForm } from "./ChangeRequestForm";

export default async function OwnerBusiness({ params }: { params: Promise<{ id: string }> }) {
  const { business: b } = await requireBusiness((await params).id);
  const c = completeness(b);
  const open = await db.profileChangeRequest.count({ where: { businessId: b.id, status: "OPEN" } });
  return (
    <>
      <OwnerTabs id={b.id} name={b.name} active="profile" />
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <ProfileForm initial={{
            id: b.id, summary: b.summary, description: b.description, phone: b.phone ?? "", email: b.email ?? "", website: b.website ?? "", address: b.address ?? "", postcode: b.postcode ?? "",
            instagram: b.instagram ?? "", facebook: b.facebook ?? "", linkedin: b.linkedin ?? "", imageUrl: b.imageUrl ?? "", areasServed: b.areasServed ?? "", founded: b.founded ? String(b.founded) : "",
            services: parseJson<string[]>(b.services, []).join(", "), hours: parseJson<Record<string, string>>(b.openingHours, {}),
          }} />
        </div>
        <aside className="space-y-6">
          <div className="rounded-xl bg-mist p-4"><p className="mb-2 font-bold">Profile completeness: {c.pct}%</p>
            <ul className="space-y-1 text-sm">{c.items.map(([n, ok]) => <li key={n}><span aria-hidden>{ok ? "✓" : "○"}</span> <span className="sr-only">{ok ? "Done: " : "To do: "}</span>{n}</li>)}</ul></div>
          <div className="rounded-xl border border-line p-4"><p className="mb-1 font-bold">Name, category or area</p>
            <p className="mb-3 text-sm text-grey">These keep PrimeStreet consistent, so a person checks changes. {open ? `${open} request${open > 1 ? "s" : ""} open.` : ""}</p>
            <ChangeRequestForm id={b.id} /></div>
          <p className="text-xs text-grey">Your edits go live immediately and are logged. Don&apos;t include offers that mislead or text copied from elsewhere. Photos: paste an image address (uploads are coming).</p>
        </aside>
      </div>
    </>
  );
}
