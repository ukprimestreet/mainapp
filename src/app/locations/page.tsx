import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { meta } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = meta({ title: "London locations", description: "Explore London business by borough: profiles, news and guides for every area.", path: "/locations" });

export default async function LocationsPage() {
  const locs = await db.location.findMany({ include: { _count: { select: { businesses: true } } }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader ld kicker="Explore" title="London by area" intro="Every London borough, with the businesses and stories we have so far. Areas grow as we add more." crumbs={[{ name: "Home", href: "/" }, { name: "Locations" }]} />
      <Container className="py-10">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locs.map((l) => (
            <li key={l.id}><Link href={`/locations/${l.slug}`} className="flex items-center justify-between rounded-xl border border-line px-4 py-4 font-bold hover:border-ink hover:bg-yellow">
              <span>{l.name}</span><span className="text-sm font-semibold text-grey">{l._count.businesses} {l._count.businesses === 1 ? "business" : "businesses"}</span></Link></li>
          ))}
        </ul>
      </Container>
    </>
  );
}
