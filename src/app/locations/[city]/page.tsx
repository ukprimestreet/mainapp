import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleCard, BusinessCard } from "@/components/Cards";
import { IntroBlock, listingLd } from "@/components/Listing";
import { Container, EmptyState, JsonLd, PageHeader, SectionHead } from "@/components/ui";
import { CitySwitcher, CityTeam } from "@/components/Cities";
import { db } from "@/lib/db";
import { redirectIfMoved } from "@/lib/redirects";
import { businessInclude, latestArticles } from "@/lib/queries";
import { areaPath, cityBySlug, legacyArea } from "@/lib/cities";
import { decideCity, getSeoPage, listingMetadata, realCounts, resolveIntro } from "@/lib/seo-engine";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ city: string }> };

async function load(slug: string) {
  const city = await cityBySlug(slug);
  if (!city || !city.active) return null;
  const path = `/locations/${city.slug}`;
  const [override, counts, areas, total] = await Promise.all([
    getSeoPage(path), realCounts(),
    db.location.findMany({ where: { cityId: city.id }, include: { _count: { select: { businesses: { where: { published: true } } } }, parent: true }, orderBy: { name: "asc" } }),
    db.business.count({ where: { cityId: city.id, published: true } }),
  ]);
  const real = areas.reduce((a, l) => a + (counts.byLocation.get(l.id) ?? 0), 0);
  const intro = resolveIntro(override, city.intro);
  return { city, path, override, areas, total, intro, verdict: decideCity(real, intro, city.status, override) };
}

export async function generateMetadata({ params }: P) {
  const d = await load((await params).city);
  if (!d) return {};
  const live = d.city.status === "LIVE";
  return listingMetadata({
    path: d.path, verdict: d.verdict, override: d.override,
    title: live ? `${d.city.name} by area` : `${d.city.name} — coming soon`,
    description: live
      ? `Explore ${d.city.name} business area by area: ${d.areas.length} areas, with profiles, reviews and local stories from PrimeStreet.`
      : `PrimeStreet is not covering ${d.city.name} yet. See what we are planning and tell us which businesses we should know about.`,
  });
}

export default async function CityAreasPage({ params }: P) {
  const { city: slug } = await params;
  const d = await load(slug);
  if (!d) {
    // Pre-multi-city URL: /locations/camden now lives at /locations/london/camden.
    const legacy = await legacyArea(slug);
    if (legacy) permanentRedirect(areaPath(legacy.city.slug, legacy.slug));
    await redirectIfMoved(`/locations/${slug}`);
    notFound();
  }
  const { city, areas, total, path } = d;
  const coming = city.status !== "LIVE";
  const [cats, articles, featured] = await Promise.all([
    coming ? [] : db.category.findMany({ where: { businesses: { some: { cityId: city.id, published: true } } }, orderBy: { name: "asc" } }),
    coming ? [] : latestArticles(undefined, 3, { cityId: city.id }),
    coming ? [] : db.business.findMany({ where: { cityId: city.id, published: true }, include: businessInclude, orderBy: [{ isFeatured: "desc" }, { ratingCount: "desc" }], take: 3 }),
  ]);
  const boroughs = areas.filter((a) => a.kind === "BOROUGH"), hoods = areas.filter((a) => a.kind === "NEIGHBOURHOOD");
  const crumbs = [{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }, { name: city.name, path }];
  return (
    <>
      <JsonLd data={listingLd({ path, name: `${city.name} by area`, description: `Business areas of ${city.name}`, crumbs, businesses: featured })} />
      <PageHeader kicker={coming ? "Coming soon" : "City"} title={coming ? `${city.name} is next` : `${city.name} by area`}
        intro={d.intro ? undefined : coming ? `We are not covering ${city.name} yet. Tell us which businesses we should know about.` : `Every area of ${city.name} we cover, with the businesses and stories we have so far.`}
        crumbs={[{ name: "Home", href: "/" }, { name: "Locations", href: "/locations" }, { name: city.name }]} />
      <Container className="space-y-14 py-10">
        <CitySwitcher active={city.slug} />
        <IntroBlock title={`About ${city.name}`} text={d.intro} />
        {coming ? (
          <EmptyState title={`${city.name} hasn't launched`} action={<Link href="/businesses/submit" className="font-bold underline">Suggest a business</Link>}>
            We only publish a city once we have real businesses and a reporter on the ground. Nothing here is made up while we wait.
          </EmptyState>
        ) : (
          <>
            <section><SectionHead title={`${boroughs.length} ${boroughs.length === 1 ? "area" : "areas"}`} />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{boroughs.map((l) => (
                <li key={l.id}><Link href={areaPath(city.slug, l.slug)} className="flex items-center justify-between rounded-xl border border-line px-4 py-4 font-bold hover:border-ink hover:bg-yellow">
                  <span>{l.name}</span><span className="text-sm font-semibold text-grey">{l._count.businesses} {l._count.businesses === 1 ? "business" : "businesses"}</span></Link></li>
              ))}</ul>
            </section>
            {hoods.length > 0 && (
              <nav aria-label={`Neighbourhoods in ${city.name}`}><SectionHead title="Neighbourhoods" />
                <ul className="flex flex-wrap gap-3">{hoods.map((l) => (
                  <li key={l.id}><Link href={areaPath(city.slug, l.slug)} className="inline-block rounded-full border border-line px-4 py-2 font-semibold hover:border-ink hover:bg-yellow">{l.name}{l.parent ? <span className="text-grey"> · {l.parent.name}</span> : null}</Link></li>
                ))}</ul></nav>
            )}
            {cats.length > 0 && (
              <nav aria-label={`Categories in ${city.name}`}><SectionHead title="Browse by category" href={`/businesses/${city.slug}`} linkText={`All ${city.name} businesses`} />
                <ul className="flex flex-wrap gap-3">{cats.map((c) => <li key={c.id}><Link href={`/businesses/${city.slug}/${c.slug}`} className="inline-block rounded-full border-2 border-ink px-4 py-2 font-bold hover:bg-yellow">{c.name}</Link></li>)}</ul></nav>
            )}
            {featured.length > 0 && <section><SectionHead title={`${total} ${total === 1 ? "business" : "businesses"} in ${city.name}`} href={`/businesses/${city.slug}`} linkText="See all" />
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((b) => <BusinessCard key={b.id} b={b} />)}</div></section>}
            {articles.length > 0 && <section><SectionHead title={`Stories from ${city.name}`} /><div className="grid gap-8 sm:grid-cols-3">{articles.map((a) => <ArticleCard key={a.id} a={a} />)}</div></section>}
          </>
        )}
        <CityTeam cityId={city.id} cityName={city.name} />
      </Container>
    </>
  );
}
