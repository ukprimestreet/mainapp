import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BusinessCard } from "@/components/Cards";
import { Button, Container, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { businessInclude } from "@/lib/queries";
import { meta } from "@/lib/seo";
import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";
const base = meta({ title: "London business directory", description: "Discover independent London businesses by category and area. Profiles show whether a business has been claimed by its owner.", path: "/businesses" });

type SP = { searchParams: Promise<{ q?: string; category?: string; area?: string; status?: string; rating?: string; sort?: string; page?: string }> };
export async function generateMetadata({ searchParams }: SP): Promise<Metadata> {
  const sp = await searchParams;
  // Filtered/search result pages are never indexed; canonical points at the clean index.
  return sp.q || sp.category || sp.area || sp.status || sp.rating || sp.sort || (sp.page && sp.page !== "1") ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function BusinessesPage({ searchParams }: SP) {
  const { q = "", category = "", area = "", status = "", rating = "", sort = "", page: pageRaw = "1" } = await searchParams;
  const PAGE = 24;
  const page = Math.max(1, Math.min(500, parseInt(pageRaw, 10) || 1));
  const term = q.trim().slice(0, 80);
  const where = {
    published: true,
    ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" as const } }, { summary: { contains: term, mode: "insensitive" as const } }] } : {}),
    ...(category ? { category: { slug: category } } : {}),
    ...(area ? { location: { slug: area } } : {}),
    ...(["3", "4"].includes(rating) ? { ratingAvg: { gte: Number(rating) } } : {}),
    ...(status === "claimed" ? { claimStatus: { in: ["CLAIMED", "VERIFIED"] } } : {}),
  };
  const text = term
    ? await searchAll({ q: term, log: !((await headers()).get("next-router-prefetch")), withContent: false, page, perPage: PAGE, filters: { category: category || undefined, area: area || undefined, minRating: rating === "4" ? 4 : rating === "3" ? 3 : undefined, claimed: status === "claimed" }, sort: sort === "rating" ? "rating" : sort === "reviews" ? "reviews" : "relevance" })
    : null;
  const [cats, locs, items, total] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ where: { businesses: { some: {} } }, orderBy: { name: "asc" } }),
    text ? Promise.resolve(text.items) : db.business.findMany({ where, include: businessInclude, orderBy: sort === "rating" ? [{ ratingAvg: { sort: "desc", nulls: "last" } }, { ratingCount: "desc" }, { name: "asc" }] : sort === "reviews" ? [{ ratingCount: "desc" }, { name: "asc" }] : [{ isFeatured: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    text ? Promise.resolve(text.total) : db.business.count({ where }),
  ]);
  const filtered = !!(term || category || area || status || rating);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n: number) => { const u = new URLSearchParams(); if (term) u.set("q", term); if (category) u.set("category", category); if (area) u.set("area", area); if (status) u.set("status", status); if (rating) u.set("rating", rating); if (sort) u.set("sort", sort); if (n > 1) u.set("page", String(n)); const s = u.toString(); return s ? `/businesses?${s}` : "/businesses"; };
  const field = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-base";
  return (
    <>
      <PageHeader ld kicker="Directory" title="London businesses" intro="Independent businesses worth knowing, by category and area. Profiles marked Unclaimed have not been verified or approved by the owner." crumbs={[{ name: "Home", href: "/" }, { name: "Businesses" }]} />
      <Container className="py-10">
        <form method="get" role="search" aria-label="Search businesses" className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-2"><label htmlFor="q" className="mb-1 block text-sm font-bold">Search</label><input id="q" name="q" defaultValue={term} placeholder="Name, service or area" className={field} /></div>
          <div><label htmlFor="category" className="mb-1 block text-sm font-bold">Category</label>
            <select id="category" name="category" defaultValue={category} className={field}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
          <div><label htmlFor="area" className="mb-1 block text-sm font-bold">Area</label>
            <select id="area" name="area" defaultValue={area} className={field}><option value="">All of London</option>{locs.map((l) => <option key={l.id} value={l.slug}>{l.name}</option>)}</select></div>
          <div><label htmlFor="status" className="mb-1 block text-sm font-bold">Profile</label>
            <select id="status" name="status" defaultValue={status} className={field}><option value="">All profiles</option><option value="claimed">Claimed by owner</option></select></div>
          <div><label htmlFor="rating" className="mb-1 block text-sm font-bold">Rating</label>
            <select id="rating" name="rating" defaultValue={rating} className={field}><option value="">Any rating</option><option value="4">4★ and up</option><option value="3">3★ and up</option></select></div>
          <div><label htmlFor="sort" className="mb-1 block text-sm font-bold">Sort</label>
            <select id="sort" name="sort" defaultValue={sort} className={field}><option value="">Featured</option><option value="rating">Top rated</option><option value="reviews">Most reviewed</option></select></div>
          <button className="min-h-12 self-end rounded-full bg-ink px-6 font-bold text-white hover:bg-charcoal">Search</button>
        </form>
        {text?.suggestion && <p role="status" className="mb-3">Did you mean <Link href={`/businesses?q=${encodeURIComponent(text.suggestion)}`} className="font-extrabold underline decoration-yellow decoration-4 underline-offset-4">{text.suggestion}</Link>?</p>}
        <p className="mb-5 text-sm text-grey" aria-live="polite">{total} {total === 1 ? "business" : "businesses"}{filtered ? " match your search" : ""}</p>
        {items.length === 0 ? (
          <EmptyState title="No businesses found" action={<Button href="/businesses" variant="dark">Clear filters</Button>}>
            Try a different area or category.
          </EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((b) => <BusinessCard key={b.id} b={b} level={2} />)}</div>
        )}
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-10 flex items-center justify-between">
            {page > 1 ? <Link href={href(page - 1)} rel="prev" className="font-bold underline">← Previous</Link> : <span />}
            <span className="text-sm text-grey">Page {page} of {pages}</span>
            {page < pages ? <Link href={href(page + 1)} rel="next" className="font-bold underline">Next →</Link> : <span />}
          </nav>
        )}
        <p className="mt-12 text-center text-grey">Can&apos;t find a business? <Link href="/businesses/submit" className="font-bold text-ink underline decoration-yellow decoration-4 underline-offset-4">Suggest it</Link>.</p>
      </Container>
    </>
  );
}
