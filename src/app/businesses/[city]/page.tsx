import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/Cards";
import { Container, EmptyState, PageHeader, SectionHead } from "@/components/ui";
import { db } from "@/lib/db";
import { businessInclude } from "@/lib/queries";
import { breadcrumbLd, meta } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import { redirectIfMoved } from "@/lib/redirects";
import { MIN_BUSINESSES, getSeoPage } from "@/lib/seo-engine";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: P) {
  const city = await db.city.findUnique({ where: { slug: (await params).city } });
  if (!city) return {};
  const [real, override] = await Promise.all([db.business.count({ where: { cityId: city.id, published: true, isSample: false } }), getSeoPage(`/businesses/${city.slug}`)]);
  return meta({ title: override?.title?.trim() || `${city.name} businesses`, description: override?.description?.trim() || `Independent businesses across ${city.name}, by category.`, path: `/businesses/${city.slug}`, noindex: override?.robots === "NOINDEX" || (override?.robots !== "INDEX" && real < MIN_BUSINESSES) });
}

export default async function CityPage({ params }: P) {
  const slug = (await params).city;
  const city = await db.city.findUnique({ where: { slug } });
  if (!city || !city.active) { await redirectIfMoved(`/businesses/${slug}`); notFound(); }
  const [cats, items] = await Promise.all([
    db.category.findMany({ where: { businesses: { some: { cityId: city.id } } }, include: { _count: { select: { businesses: true } } }, orderBy: { name: "asc" } }),
    db.business.findMany({ where: { cityId: city.id, published: true }, include: businessInclude, orderBy: { isFeatured: "desc" }, take: 9 }),
  ]);
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Businesses", path: "/businesses" }, { name: city.name, path: `/businesses/${city.slug}` }])} />
      <PageHeader kicker="City" title={`${city.name} businesses`} crumbs={[{ name: "Home", href: "/" }, { name: "Businesses", href: "/businesses" }, { name: city.name }]} />
      <Container className="py-10">
        <SectionHead title="By category" />
        <ul className="mb-14 flex flex-wrap gap-3">{cats.map((c) => <li key={c.id}><Link href={`/businesses/${city.slug}/${c.slug}`} className="inline-block rounded-full border-2 border-ink px-4 py-2 font-bold hover:bg-yellow">{c.name} <span className="text-grey">({c._count.businesses})</span></Link></li>)}</ul>
        <SectionHead title="Featured profiles" href="/businesses" />
        {items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((b) => <BusinessCard key={b.id} b={b} />)}</div> : <EmptyState title="No businesses yet" />}
      </Container>
    </>
  );
}
