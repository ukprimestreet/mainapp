import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/Cards";
import { IntroBlock, Pagination, listingLd } from "@/components/Listing";
import { Container, JsonLd, PageHeader, SectionHead } from "@/components/ui";
import { db } from "@/lib/db";
import { redirectIfMoved } from "@/lib/redirects";
import { FeaturedSlot } from "@/components/Sponsored";
import { businessInclude } from "@/lib/queries";
import { areaCatPath, areaPath, cityBySlug } from "@/lib/cities";
import { PAGE_SIZE, decideLocCat, getSeoPage, listingMetadata, realCounts, resolveIntro } from "@/lib/seo-engine";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ city: string; area: string; category: string }>; searchParams: Promise<{ page?: string }> };
const pageNum = (s?: string) => Math.max(1, Math.min(500, parseInt(s ?? "1", 10) || 1));

async function load(citySlug: string, areaSlug: string, category: string, page: number) {
  const city = await cityBySlug(citySlug);
  if (!city || !city.active || city.status !== "LIVE") return null;
  const [loc, cat] = await Promise.all([
    db.location.findUnique({ where: { cityId_slug: { cityId: city.id, slug: areaSlug } } }),
    db.category.findUnique({ where: { slug: category } }),
  ]);
  if (!loc || !cat) return null;
  const where = { locationId: loc.id, categoryId: cat.id, published: true };
  const total = await db.business.count({ where });
  if (!total) return null; // area x category pages exist only when there is something to show
  const path = areaCatPath(city.slug, loc.slug, cat.slug);
  const [override, counts, items] = await Promise.all([
    getSeoPage(path), realCounts(),
    db.business.findMany({ where, include: businessInclude, orderBy: [{ isFeatured: "desc" }, { ratingCount: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const real = counts.byLocCat.get(`${loc.id}:${cat.id}`) ?? 0;
  const intro = resolveIntro(override, null);
  return { city, loc, cat, path, override, items, total, intro, verdict: decideLocCat(real, intro, override) };
}

export async function generateMetadata({ params, searchParams }: P) {
  const p = await params; const page = pageNum((await searchParams).page);
  const d = await load(p.city, p.area, p.category, page);
  if (!d) return {};
  return listingMetadata({
    path: d.path, page, verdict: d.verdict, override: d.override,
    title: `${d.cat.name} in ${d.loc.name}, ${d.city.name}`,
    description: `${d.total} ${d.cat.name.toLowerCase()} ${d.total === 1 ? "business" : "businesses"} in ${d.loc.name}, ${d.city.name}. Compare local options with profiles, services and reviews on PrimeStreet.`,
  });
}

export default async function AreaCategoryPage({ params, searchParams }: P) {
  const p = await params; const page = pageNum((await searchParams).page);
  const d = await load(p.city, p.area, p.category, page);
  if (!d) { await redirectIfMoved(`/locations/${p.city}/${p.area}/${p.category}`); notFound(); }
  const { city, loc, cat, items, total, path } = d;
  const [sameCatElsewhere, sameAreaOther] = await Promise.all([
    db.location.findMany({ where: { cityId: city.id, id: { not: loc.id }, businesses: { some: { categoryId: cat.id, published: true } } }, take: 8, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { id: { not: cat.id }, businesses: { some: { locationId: loc.id, published: true } } }, take: 8, orderBy: { name: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const crumbs = [{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }, { name: city.name, path: `/locations/${city.slug}` }, { name: loc.name, path: areaPath(city.slug, loc.slug) }, { name: cat.name, path }];
  return (
    <>
      <JsonLd data={listingLd({ path, name: `${cat.name} in ${loc.name}`, description: `${cat.name} businesses in ${loc.name}, ${city.name}`, crumbs, businesses: items })} />
      <PageHeader kicker="Local" title={`${cat.name} in ${loc.name}`} crumbs={[{ name: "Home", href: "/" }, { name: "Locations", href: "/locations" }, { name: city.name, href: `/locations/${city.slug}` }, { name: loc.name, href: areaPath(city.slug, loc.slug) }, { name: cat.name }]} />
      <Container className="space-y-14 py-10">
        <IntroBlock title={`${cat.name} in ${loc.name}`} text={page === 1 ? d.intro : null} />
        {page === 1 && <FeaturedSlot categoryId={cat.id} locationId={loc.id} heading={`Featured ${cat.name.toLowerCase()} in ${loc.name}`} />}
        <section><SectionHead title={`${total} ${total === 1 ? "business" : "businesses"}`} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
          <Pagination basePath={path} page={page} pages={pages} />
        </section>
        <nav aria-label="Related pages" className="grid gap-10 md:grid-cols-2">
          {sameAreaOther.length > 0 && <div><h2 className="mb-3 text-xl font-extrabold">More in {loc.name}</h2><ul className="flex flex-wrap gap-2">{sameAreaOther.map((c) => <li key={c.id}><Link href={areaCatPath(city.slug, loc.slug, c.slug)} className="inline-block rounded-full border border-line px-4 py-2 font-semibold hover:border-ink hover:bg-yellow">{c.name}</Link></li>)}</ul>
            <p className="mt-3"><Link href={areaPath(city.slug, loc.slug)} className="font-bold underline">All businesses in {loc.name} →</Link></p></div>}
          {sameCatElsewhere.length > 0 && <div><h2 className="mb-3 text-xl font-extrabold">{cat.name} in other areas</h2><ul className="flex flex-wrap gap-2">{sameCatElsewhere.map((a) => <li key={a.id}><Link href={areaCatPath(city.slug, a.slug, cat.slug)} className="inline-block rounded-full border border-line px-4 py-2 font-semibold hover:border-ink hover:bg-yellow">{a.name}</Link></li>)}</ul>
            <p className="mt-3"><Link href={`/businesses/${city.slug}/${cat.slug}`} className="font-bold underline">All {cat.name.toLowerCase()} in {city.name} →</Link></p></div>}
        </nav>
      </Container>
    </>
  );
}
