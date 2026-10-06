import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/Cards";
import { IntroBlock, Pagination, listingLd } from "@/components/Listing";
import { Container, EmptyState, JsonLd, PageHeader, SectionHead } from "@/components/ui";
import { db } from "@/lib/db";
import { redirectIfMoved } from "@/lib/redirects";
import { FeaturedSlot } from "@/components/Sponsored";
import { businessInclude } from "@/lib/queries";
import { PAGE_SIZE, decideCategory, getSeoPage, listingMetadata, realCounts, resolveIntro } from "@/lib/seo-engine";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ city: string; category: string }>; searchParams: Promise<{ page?: string }> };
const pageNum = (s?: string) => Math.max(1, Math.min(500, parseInt(s ?? "1", 10) || 1));

async function load(p: { city: string; category: string }, page: number) {
  const [city, category] = await Promise.all([db.city.findUnique({ where: { slug: p.city } }), db.category.findUnique({ where: { slug: p.category } })]);
  if (!city || !category) return null;
  const path = `/businesses/${city.slug}/${category.slug}`;
  const where = { cityId: city.id, categoryId: category.id, published: true };
  const [override, counts, total, items] = await Promise.all([
    getSeoPage(path), realCounts(), db.business.count({ where }),
    db.business.findMany({ where, include: businessInclude, orderBy: [{ isFeatured: "desc" }, { ratingCount: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const real = counts.byCategory.get(category.id) ?? 0;
  const intro = resolveIntro(override, category.intro);
  return { city, category, path, override, items, total, intro, verdict: decideCategory(real, intro, override) };
}

export async function generateMetadata({ params, searchParams }: P) {
  const page = pageNum((await searchParams).page);
  const d = await load(await params, page);
  if (!d) return {};
  return listingMetadata({
    path: d.path, page, verdict: d.verdict, override: d.override,
    title: `${d.category.name} in ${d.city.name}`,
    description: d.category.intro?.slice(0, 150) || `${d.total} ${d.category.name.toLowerCase()} ${d.total === 1 ? "business" : "businesses"} across ${d.city.name}. Profiles, reviews and local stories on PrimeStreet.`,
  });
}

export default async function CategoryInCityPage({ params, searchParams }: P) {
  const p = await params; const page = pageNum((await searchParams).page);
  const d = await load(p, page);
  if (!d) { await redirectIfMoved(`/businesses/${p.city}/${p.category}`); notFound(); }
  const { city, category, items, total, path } = d;
  const [areas, otherCats] = await Promise.all([
    db.location.findMany({ where: { businesses: { some: { categoryId: category.id, published: true } } }, include: { _count: { select: { businesses: { where: { categoryId: category.id, published: true } } } } }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { id: { not: category.id }, businesses: { some: { cityId: city.id, published: true } } }, orderBy: { name: "asc" }, take: 12 }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const crumbs = [{ name: "Home", path: "/" }, { name: "Businesses", path: "/businesses" }, { name: city.name, path: `/businesses/${city.slug}` }, { name: category.name, path }];
  return (
    <>
      <JsonLd data={listingLd({ path, name: `${category.name} in ${city.name}`, description: category.intro ?? `${category.name} in ${city.name}`, crumbs, businesses: items })} />
      <PageHeader kicker="Category" title={`${category.name} in ${city.name}`} intro={d.intro ? undefined : category.intro ?? undefined}
        crumbs={[{ name: "Home", href: "/" }, { name: "Businesses", href: "/businesses" }, { name: city.name, href: `/businesses/${city.slug}` }, { name: category.name }]} />
      <Container className="space-y-14 py-10">
        <IntroBlock title={`About ${category.name.toLowerCase()} in ${city.name}`} text={page === 1 ? d.intro : null} />
        {areas.length > 0 && (
          <nav aria-label={`${category.name} by area`}><SectionHead title={`${category.name} by area`} />
            <ul className="flex flex-wrap gap-3">{areas.map((a) => <li key={a.id}><Link href={`/locations/${city.slug}/${a.slug}/${category.slug}`} className="inline-block rounded-full border-2 border-ink px-4 py-2 font-bold hover:bg-yellow">{a.name} <span className="text-grey">({a._count.businesses})</span></Link></li>)}</ul></nav>
        )}
        {page === 1 && <FeaturedSlot categoryId={category.id} />}
        <section><SectionHead title={`${total} ${total === 1 ? "business" : "businesses"}`} />
          {items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((b) => <BusinessCard key={b.id} b={b} />)}</div> : <EmptyState title="No businesses in this category yet" />}
          <Pagination basePath={path} page={page} pages={pages} />
        </section>
        {otherCats.length > 0 && <nav aria-label="Other categories"><SectionHead title="Other categories" href={`/businesses/${city.slug}`} linkText={`All of ${city.name}`} />
          <ul className="flex flex-wrap gap-3">{otherCats.map((c) => <li key={c.id}><Link href={`/businesses/${city.slug}/${c.slug}`} className="inline-block rounded-full border border-line px-4 py-2 font-semibold hover:border-ink hover:bg-yellow">{c.name}</Link></li>)}</ul></nav>}
      </Container>
    </>
  );
}
