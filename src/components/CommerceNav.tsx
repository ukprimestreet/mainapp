import Link from "next/link";

const TABS = [["/admin/commerce", "Overview & products"], ["/admin/commerce/subscriptions", "Premium plans"], ["/admin/commerce/campaigns", "Campaigns"], ["/admin/commerce/sponsorships", "Sponsorships"], ["/admin/commerce/enquiries", "Enquiries"]] as const;
export function CommerceNav({ active, msg }: { active: string; msg?: string }) {
  return (
    <>
      <h1 className="mb-3 text-3xl font-extrabold">Commerce</h1>
      <nav aria-label="Commerce sections" className="mb-6 flex flex-wrap gap-2">{TABS.map(([h, l]) => <Link key={h} href={h} aria-current={active === h ? "page" : undefined} className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${active === h ? "border-ink bg-ink text-yellow" : "border-line"}`}>{l}</Link>)}</nav>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
    </>
  );
}
