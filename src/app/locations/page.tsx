import Link from "next/link";
import { redirect } from "next/navigation";
import { Container, PageHeader, SectionHead } from "@/components/ui";
import { db } from "@/lib/db";
import { browsableCities } from "@/lib/cities";
import { meta } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = meta({ title: "Locations", description: "Explore local business city by city and area by area: profiles, news and guides for every area we cover.", path: "/locations" });

export default async function LocationsPage() {
  const cities = await browsableCities();
  // While PrimeStreet is a single-city title there is nothing to choose: send readers straight to that city.
  if (cities.length === 1) redirect(`/locations/${cities[0].slug}`);
  const areas = await db.location.groupBy({ by: ["cityId"], where: { kind: "BOROUGH" }, _count: { _all: true } });
  const biz = await db.business.groupBy({ by: ["cityId"], where: { published: true }, _count: { _all: true } });
  const n = (rows: { cityId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.cityId === id)?._count._all ?? 0;
  const live = cities.filter((c) => c.status === "LIVE"), soon = cities.filter((c) => c.status !== "LIVE");
  return (
    <>
      <PageHeader ld kicker="Explore" title="Where we cover" intro="PrimeStreet covers one city properly before it adds another. Each city has its own reporters, its own areas and its own directory." crumbs={[{ name: "Home", href: "/" }, { name: "Locations" }]} />
      <Container className="space-y-14 py-10">
        <section><SectionHead title={`${live.length} ${live.length === 1 ? "city" : "cities"}`} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{live.map((c) => (
            <li key={c.id}><Link href={`/locations/${c.slug}`} className="block rounded-2xl border-2 border-ink p-5 hover:bg-yellow">
              <p className="font-display text-2xl font-extrabold">{c.name}</p>
              {c.region && <p className="text-sm text-grey">{c.region}</p>}
              <p className="mt-2 text-sm font-semibold">{n(areas, c.id)} areas · {n(biz, c.id)} {n(biz, c.id) === 1 ? "business" : "businesses"}</p>
            </Link></li>
          ))}</ul>
        </section>
        {soon.length > 0 && (
          <section><SectionHead title="Coming next" />
            <p className="mb-4 max-w-2xl text-grey">We open a city once we have real businesses on the ground and someone to report on them. Until then these pages stay empty on purpose.</p>
            <ul className="flex flex-wrap gap-3">{soon.map((c) => (
              <li key={c.id}><Link href={`/locations/${c.slug}`} className="inline-block rounded-full border border-line px-4 py-2 font-semibold hover:border-ink hover:bg-yellow">{c.name} <span className="text-grey">· coming soon</span></Link></li>
            ))}</ul>
          </section>
        )}
      </Container>
    </>
  );
}
