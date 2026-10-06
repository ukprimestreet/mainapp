import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleCard, BusinessCard } from "@/components/Cards";
import { IntroBlock, Pagination, listingLd } from "@/components/Listing";
import { Container, EmptyState, JsonLd, PageHeader, SectionHead } from "@/components/ui";
import { db } from "@/lib/db";
import { redirectIfMoved } from "@/lib/redirects";
import { FeaturedSlot } from "@/components/Sponsored";
import { businessInclude, latestArticles } from "@/lib/queries";
import { areaCatPath, areaPath, cityBySlug, legacyArea } from "@/lib/cities";
import { PAGE_SIZE, decideLocation, getSeoPage, listingMetadata, realCounts, resolveIntro } from "@/lib/seo-engine";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ city: string; area: string }>; searchParams: Promise<{ page?: string }> };
const pageNum = (s?: string) => Math.max(1, Math.min(500, parseInt(s ?? "1", 10) || 1));

async function load(citySlug: string, areaSlug: string, page: number) {
  const city = await cityBySlug(citySlug);
  if (!city || !city.active || city.status !== "LIVE") return null;
  const loc = await db.location.findUnique({ where: { cityId_slug: { cityId: city.id, slug: areaSlug } }, include: { parent: true, children: { orderBy: { name: "asc" } } } });
  if (!loc) return null;
  const path = areaPath(city.slug, loc.slug);
  const childIds = loc.children.map((c) => c.id);
  const where = { locationId: childIds.length ? { in: [loc.id, ...childIds] } : loc.id, published: true };
  const [override, counts, total, items] = await Promise.all([
    getSeoPage(path), realCounts(), db.business.count({ where }),
    db.business.findMany({ where, include: businessInclude, orderBy: [{ isFeatured: "desc" }, { ratingCount: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const real = counts.byLocation.get(loc.id) ?? 0;
  const intro = resolveIntro(override, loc.intro);
  return { city, loc, path, override, items, total, real, intro, verdict: decideLocation(real, intro, override) };
}

export async function generateMetadata({ params, searchParams }: P) {
  const p = await params; const page = pageNum((await searchParams).page);
  const d = await load(p.city, p.area, page);
  if (!d) return {};
  const cats = await db.category.findMany({ where: { businesses: { some: { locationId: d.loc.id, published: true } } }, take: 3, orderBy: { name: "asc" } });
  return listingMetadata({
    path: d.path, page, verdict: d.verdict, override: d.override,
    title: `Businesses in ${d.loc.name}, ${d.city.name}`,
    description: d.total
      ? `${d.total} local ${d.total === 1 ? "business" : "businesses"} in ${d.loc.name}${cats.length ? `, from ${cats.map((c) => c.name.toLowerCase()).join(", ")} and more` : ""}. Profiles, reviews and stories from PrimeStreet.`
      : `Local businesses and stories from ${d.loc.name}, ${d.city.name}.`,
  });
}

export default async function AreaPage({ params, searchParams }: P) {
  const p = await params; const page = pageNum((await searchParams).page);
  const d = await load(p.city, p.area, page);
  if (!d) {
    // Pre-multi-city URL: /locations/camden/cleaning now lives at /locations/london/camden/cleaning.
    const legacy = await legacyArea(p.city);
    if (legacy && (await db.category.findUnique({ where: { slug: p.area } }))) permanentRedirect(areaCatPath(legacy.city.slug, legacy.slug, p.area));
    await redirectIfMoved(`/locations/${p.city}/${p.area}`);
    notFound();
  }
  const { city, loc, items, total, path } = d;
  const [articles, locCats, siblings] = await Promise.all([
    latestArticles(undefined, 6, { locationId: loc.id }),
    db.category.findMany({ where: { businesses: { some: { locationId: loc.id, published: true } } }, orderBy: { name: "asc" } }),
    db.location.findMany({ where: { cityId: city.id, id: { not: loc.id }, kind: "BOROUGH", businesses: { some: { published: true } } }, include: { _count: { select: { businesses: true } } }, orderBy: { businesses: { _count: "desc" } }, take: 8 }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const parentCrumb = loc.parent ? [{ name: loc.parent.name, path: areaPath(city.slug, loc.parent.slug) }] : [];
  const crumbs = [{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }, { name: city.name, path: `/locations/${city.slug}` }, ...parentCrumb, { name: loc.name, path }];
  return (
    <>
      <JsonLd data={listingLd({ path, name: `Businesses in ${loc.name}`, description: `Local businesses in ${loc.name}, ${city.name}`, crumbs, businesses: items })} />
      <PageHeader kicker={loc.kind === "NEIGHBOURHOOD" ? "Neighbourhood" : "Area"} title={`Businesses in ${loc.name}`}
        intro={d.intro ? undefined : `Local businesses and stories from ${loc.name}, ${city.name}.`}
        crumbs={[{ name: "Home", href: "/" }, { name: "Locations", href: "/locations" }, { name: city.name, href: `/locations/${city.slug}` }, ...(loc.parent ? [{ name: loc.parent.name, href: areaPath(city.slug, loc.parent.slug) }] : []), { name: loc.name }]} />
      <Container className="space-y-14 py-10">
        <IntroBlock title={`About ${loc.name}`} text={page === 1 ? d.intro : null} />
        {loc.children.length > 0 && (
          <nav aria-label={`Neighbourhoods in ${loc.name}`}><SectionHead title={`Neighbourhoods in ${loc.name}`} />
            <ul className="flex flex-wrap gap-3">{loc.children.map((c) => <li key={c.id}><Link href={areaPath(city.slug, c.slug)} className="inline-block rounded-full border border-line px-4 py-2 font-semibold hover:border-ink hover:bg-yellow">{c.name}</Link></li>)}</ul></nav>
        )}
        {locCats.length > 0 && (
          <nav aria-label={`Categories in ${loc.name}`}><SectionHead title="Browse by category" />
            <ul className="flex flex-wrap gap-3">{locCats.map((c) => <li key={c.id}><Link href={areaCatPath(city.slug, loc.slug, c.slug)} className="inline-block rounded-full border-2 border-ink px-4 py-2 font-bold hover:bg-yellow">{c.name} in {loc.name}</Link></li>)}</ul></nav>
        )}
        {page === 1 && <FeaturedSlot locationId={loc.id} heading={`Featured in ${loc.name}`} />}
        <section><SectionHead title={`${total} ${total === 1 ? "business" : "businesses"} in ${loc.name}`} />
          {items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
            : <EmptyState title={`We haven't added businesses in ${loc.name} yet`} action={<Link href="/businesses/submit" className="font-bold underline">Know one? Suggest it</Link>}>This area is on our list.</EmptyState>}
          <Pagination basePath={path} page={page} pages={pages} />
        </section>
        {articles.length > 0 && <section><SectionHead title={`Stories from ${loc.name}`} /><div className="grid gap-8 sm:grid-cols-3">{articles.map((a) => <ArticleCard key={a.id} a={a} />)}</div></section>}
        {siblings.length > 0 && (
          <nav aria-label="Other areas"><SectionHead title={`Explore other areas of ${city.name}`} href={`/locations/${city.slug}`} linkText="All areas" />
            <ul className="flex flex-wrap gap-3">{siblings.map((a) => <li key={a.id}><Link href={areaPath(city.slug, a.slug)} className="inline-block rounded-full border border-line px-4 py-2 font-semibold hover:border-ink hover:bg-yellow">{a.name} <span className="text-grey">({a._count.businesses})</span></Link></li>)}</ul></nav>
        )}
      </Container>
    </>
  );
}
