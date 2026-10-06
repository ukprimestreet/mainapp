import Link from "next/link";

export function OwnerTabs({ id, name, active }: { id: string; name: string; active: "profile" | "reviews" | "coverage" | "promote" | "leads" }) {
  const tabs = [["profile", "Profile", `/owner/business/${id}`], ["reviews", "Reviews", `/owner/business/${id}/reviews`], ["coverage", "Tell us your story", `/owner/business/${id}/coverage`], ["promote", "Promote", `/owner/business/${id}/promote`], ["leads", "Enquiries", `/owner/business/${id}/leads`]] as const;
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/owner" className="underline">← All my businesses</Link></p>
      <h1 className="mb-4 text-3xl font-extrabold">{name}</h1>
      <nav aria-label="Business sections" className="mb-8 flex flex-wrap gap-2">
        {tabs.map(([k, label, href]) => <Link key={k} href={href} aria-current={active === k ? "page" : undefined} className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${active === k ? "border-ink bg-ink text-yellow" : "border-line"}`}>{label}</Link>)}
      </nav>
    </>
  );
}
