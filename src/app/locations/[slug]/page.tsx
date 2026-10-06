import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard, BusinessCard } from "@/components/Cards";
import { IntroBlock, Pagination, listingLd } from "@/components/Listing";
import { Container, EmptyState, JsonLd, PageHeader, SectionHead } from "@/components/ui";
import { db } from "@/lib/db";
import { redirectIfMoved } from "@/lib/redirects";
import { FeaturedSlot } from "@/components/Sponsored";
import { businessInclude, latestArticles } from "@/lib/queries";
import { PAGE_SIZE, decideLocation, getSeoPage, listingMetadata, realCounts, resolveIntro } from "@/lib/seo-engine";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

async function load(slug: string, page: number) {
  const loc = await db.location.findUnique({ where: { slug }, include: { city: true } });
  if (!loc) return null;
  const path = `/locations/${loc.slug}`;
  const where = { locationId: loc.id, published: true };
  const [override, counts, total, items] = await Promise.all([
    getSeoPage(path), realCounts(), db.business.count({ where }),
    db.business.findMany({ where, include: businessInclude, orderBy: [{ isFeatured: "desc" }, { ratingCount: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const real = counts.byLocation.get(loc.id) ?? 0;
  const intro = resolveIntro(override, loc.intro);
  return { loc, path, override, items, total, real, intro, verdict: decideLocation(real, intro, override) };
}
const pageNum = (s?: string) => Math.max(1, Math.min(500, parseInt(s ?? "1", 10) || 1));

export async function generateMetadata({ params, searchParams }: P) {
  const page = pageNum((await searchParams).page);
  const d = await load((await params).slug, page);
  if (!d) return {};
  const cats = await db.category.findMany({ where: { businesses: { some: { locationId: d.loc.id, published: true } } }, take: 3, orderBy: { name: "asc" } });
  return listingMetadata({
    path: d.path, page, verdict: d.verdict, override: d.override,
    title: `Businesses in ${d.loc.name}, London`,
    description: d.total ? `${d.total} local ${d.total === 1 ? "business" : "businesses"} in ${d.loc.name}${cats.length ? `, from ${cats.map((c) => c.name.toLowerCase()).join(", ")} and more` : ""}. Profiles, reviews and stories from PrimeStreet.` : `Local businesses and stories from ${d.loc.name}, London.`,
  });
}

export default async function LocationPage({ params, searchParams }: P) {
  const { slug } = await params;
  const page = pageNum((await searchParams).page);
  const d = await load(slug, page);
  if (!d) { await redirectIfMoved(`/locations/${slug}`); notFound(); }
  const { loc, items, total, path } = d;
  const [articles, locCats, otherAreas] = await Promise.all([
    latestArticles(undefined, 6, { locationId: loc.id }),
    db.category.findMany({ where: { businesses: { some: { locationId: loc.id, published: true } } }, orderBy: { name: "asc" } }),
    db.location.findMany({ where: { id: { not: loc.id }, businesses: { some: { published: true } } }, include: { _count: { select: { businesses: true } } }, orderBy: { businesses: { _count: "desc" } }, take: 8 }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const crumbs = [{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }, { name: loc.name, path }];
  return (
    <>
      <JsonLd data={listingLd({ path, name: `Businesses in ${loc.name}`, description: `Local businesses in ${loc.name}, London`, crumbs, businesses: items })} />
      <PageHeader kicker="Location" title={`Businesses in ${loc.name}`} intro={d.intro ? undefined : `Local businesses and stories from ${loc.name}, London.`} crumbs={[{ name: "Home", href: "/" }, { name: "Locations", href: "/locations" }, { name: loc.name }]} />
      <Container className="space-y-14 py-10">
        <IntroBlock title={`About ${loc.name}`} text={page === 1 ? d.intro : null} />
        {locCats.length > 0 && (
          <nav aria-label={`Categories in ${loc.name}`}><SectionHead title="Browse by category" />
            <ul className="flex flex-wrap gap-3">{locCats.map((c) => <li key={c.id}><Link href={`/locations/${loc.slug}/${c.slug}`} className="inline-block rounded-full border-2 border-ink px-4 py-2 font-bold hover:bg-yellow">{c.name} in {loc.name}</Link></li>)}</ul></nav>
        )}
        {page === 1 && <FeaturedSlot locationId={loc.id} heading={`Featured in ${loc.name}`} />}
        <section><SectionHead title={`${total} ${total === 1 ? "business" : "businesses"} in ${loc.name}`} />
          {items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
            : <EmptyState title={`We haven't added businesses in ${loc.name} yet`} action={<Link href="/businesses/submit" className="font-bold underline">Know one? Suggest it</Link>}>This area is on our list.</EmptyState>}
          <Pagination basePath={path} page={page} pages={pages} />
        </section>
        {articles.length > 0 && <section><SectionHead title={`Stories from ${loc.name}`} /><div className="grid gap-8 sm:grid-cols-3">{articles.map((a) => <ArticleCard key={a.id} a={a} />)}</div></section>}
        {otherAreas.length > 0 && (
          <nav aria-label="Other areas"><SectionHead title="Explore other areas" href="/locations" linkText="All areas" />
            <ul className="flex flex-wrap gap-3">{otherAreas.map((a) => <li key={a.id}><Link href={`/locations/${a.slug}`} className="inline-block rounded-full border border-line px-4 py-2 font-semibold hover:border-ink hover:bg-yellow">{a.name} <span className="text-grey">({a._count.businesses})</span></Link></li>)}</ul></nav>
        )}
      </Container>
    </>
  );
}
