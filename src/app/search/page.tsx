import NextLink from "next/link";
import { headers } from "next/headers";
// Query links must never be prefetched: a prefetch renders (and would count) a full search.
const Link = (p: React.ComponentProps<typeof NextLink>) => <NextLink prefetch={false} {...p} />;
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArticleCard, BusinessCard, fmtDate } from "@/components/Cards";
import { NearMe } from "@/components/NearMe";
import { SearchBox } from "@/components/SearchBox";
import { Container, EmptyState, PageHeader, SampleBadge, SectionHead } from "@/components/ui";
import { lookupPostcode, normalisePostcode, validLatLng, type LatLng } from "@/lib/geo";
import { searchAll } from "@/lib/search";
import { FeaturedSlot } from "@/components/Sponsored";

export const dynamic = "force-dynamic";
type SP = { searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ searchParams }: SP): Promise<Metadata> {
  const q = (await searchParams).q?.trim();
  // Search result pages are never indexed (infinite near-duplicate pages): noindex,follow.
  return { title: q ? `Search: ${q.slice(0, 60)}` : "Search", description: "Search London businesses, stories and podcast episodes.", robots: { index: false, follow: true } };
}

const SORTS = [["relevance", "Best match"], ["rating", "Top rated"], ["reviews", "Most reviewed"], ["name", "A–Z"], ["nearest", "Nearest"]] as const;

export default async function SearchPage({ searchParams }: SP) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const page = Math.max(1, Math.min(200, parseInt(sp.page ?? "1", 10) || 1));
  const minRating = sp.rating === "4" ? 4 : sp.rating === "3" ? 3 : undefined;
  const filters = { category: sp.category || undefined, area: sp.area || undefined, minRating, claimed: sp.claimed === "1", openNow: sp.open === "1" };

  // location: coordinates (browser geolocation) or a UK postcode
  let near: LatLng | null = null, nearLabel = "", locError = "";
  const m = sp.near?.match(/^(-?\d{1,2}\.\d{1,6}),(-?\d{1,3}\.\d{1,6})$/);
  if (m && validLatLng(Number(m[1]), Number(m[2]))) { near = { lat: Number(m[1]), lng: Number(m[2]) }; nearLabel = "your location"; }
  else if (sp.postcode?.trim()) {
    near = await lookupPostcode(sp.postcode);
    if (near) nearLabel = normalisePostcode(sp.postcode) ?? sp.postcode.trim().toUpperCase(); else locError = `We couldn't find the postcode “${sp.postcode.slice(0, 12)}”.`;
  }
  const sort = SORTS.some(([k]) => k === sp.sort) && (sp.sort !== "nearest" || near) ? (sp.sort as "relevance") : undefined;

  const hasQuery = q.length > 0 || !!near;
  const h = await headers();
  const prefetching = !!h.get("next-router-prefetch") || h.get("purpose") === "prefetch";
  const r = hasQuery ? await searchAll({ q, filters, sort, page, near, log: !prefetching }) : null;

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v && k !== "page") p.set(k, v);
    return `/search?${p.toString()}`;
  };
  const chip = (active: boolean, label: React.ReactNode, to: string, key: string) => (
    <li key={key}><Link href={to} aria-current={active ? "true" : undefined} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-ink font-bold text-yellow" : "hover:bg-yellow"}`}>{label}</Link></li>
  );

  return (
    <>
      <PageHeader kicker="Search" title={q ? `Results for “${q}”` : near ? "Businesses near you" : "Search PrimeStreet"} intro={q || near ? undefined : "Find London businesses, stories and podcast episodes."} crumbs={[{ name: "Home", href: "/" }, { name: "Search" }]} />
      <Container className="py-8">
        <div className="mb-8 max-w-2xl"><SearchBox id="search-main" /></div>
        {!hasQuery && (
          <div className="grid gap-8 md:grid-cols-2"><div><h2 className="mb-3 text-xl font-extrabold">Try searching for</h2><ul className="flex flex-wrap gap-2">{["cleaners in Hackney", "removals", "barber", "coffee", "plumber", "accountant", "yoga"].map((t) => <li key={t}><Link href={`/search?q=${encodeURIComponent(t)}`} className="inline-block rounded-full border-2 border-ink px-4 py-2 font-bold hover:bg-yellow">{t}</Link></li>)}</ul></div>
            <Suspense><NearMe /></Suspense></div>
        )}
        {locError && <p role="alert" className="mb-4 rounded-lg border-2 border-red-700 p-3 font-bold">⚠ {locError}</p>}

        {r && (
          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
            <aside className="space-y-6" aria-label="Filters">
              <Suspense><NearMe /></Suspense>
              <details open className="rounded-2xl border border-line p-4 lg:[&_summary]:pointer-events-none"><summary className="cursor-pointer font-display text-lg font-extrabold">Filter</summary>
                <div className="mt-3 space-y-5">
                  {r.facets.categories.length > 0 && <div><h3 className="mb-1 text-sm font-bold uppercase text-grey">Category</h3><ul>{r.facets.categories.slice(0, 8).map((c) => chip(sp.category === c.slug, <><span>{c.name}</span><span className="text-xs opacity-70">{c.n}</span></>, href({ category: sp.category === c.slug ? null : c.slug }), c.slug))}</ul></div>}
                  {r.facets.areas.length > 0 && <div><h3 className="mb-1 text-sm font-bold uppercase text-grey">Area</h3><ul>{r.facets.areas.slice(0, 8).map((a) => chip(sp.area === a.slug, <><span>{a.name}</span><span className="text-xs opacity-70">{a.n}</span></>, href({ area: sp.area === a.slug ? null : a.slug }), a.slug))}</ul></div>}
                  <div><h3 className="mb-1 text-sm font-bold uppercase text-grey">More</h3><ul>
                    {chip(sp.rating === "4", <><span>4★ and up</span><span className="text-xs opacity-70">{r.facets.rating4}</span></>, href({ rating: sp.rating === "4" ? null : "4" }), "r4")}
                    {chip(sp.rating === "3", <><span>3★ and up</span><span className="text-xs opacity-70">{r.facets.rating3}</span></>, href({ rating: sp.rating === "3" ? null : "3" }), "r3")}
                    {chip(sp.claimed === "1", <><span>Claimed by owner</span><span className="text-xs opacity-70">{r.facets.claimed}</span></>, href({ claimed: sp.claimed === "1" ? null : "1" }), "cl")}
                    {chip(sp.open === "1", <><span>Open now</span><span className="text-xs opacity-70">{r.facets.openNow}</span></>, href({ open: sp.open === "1" ? null : "1" }), "op")}</ul></div>
                  {(sp.category || sp.area || sp.rating || sp.claimed || sp.open) && <Link href={href({ category: null, area: null, rating: null, claimed: null, open: null })} className="text-sm font-bold underline">Clear all filters</Link>}
                </div></details>
            </aside>

            <div className="min-w-0 space-y-12">
              {r.suggestion && <p role="status" className="text-lg">{r.total === 0 ? "No results. " : ""}Did you mean <Link href={href({ q: r.suggestion })} className="font-extrabold underline decoration-yellow decoration-4 underline-offset-4">{r.suggestion}</Link>?</p>}
              {r.relaxed && <p className="rounded-xl bg-yellow-soft p-3 text-sm font-semibold">We couldn&apos;t find a business matching every word, so these match some of your words.</p>}
              {(r.matchedCategories.length > 0 || r.matchedAreas.length > 0) && (
                <nav aria-label="Related pages" className="flex flex-wrap gap-2">{r.matchedCategories.map((c) => <Link key={c.id} href={`/businesses/london/${c.slug}`} className="rounded-full border-2 border-ink px-4 py-1.5 text-sm font-bold hover:bg-yellow">All {c.name.toLowerCase()} →</Link>)}{r.matchedAreas.map((l) => <Link key={l.id} href={`/locations/${l.slug}`} className="rounded-full border-2 border-ink px-4 py-1.5 text-sm font-bold hover:bg-yellow">{l.name} →</Link>)}</nav>
              )}

              {r.matchedCategories[0] && page === 1 && <FeaturedSlot categoryId={r.matchedCategories[0].id} heading={`Featured ${r.matchedCategories[0].name.toLowerCase()}`} />}
              <section aria-labelledby="biz">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-4 border-ink pb-2"><h2 id="biz" className="text-2xl font-extrabold">Businesses <span className="text-base font-bold text-grey">({r.total})</span>{nearLabel && <span className="ml-2 text-base font-normal text-grey">near {nearLabel}</span>}</h2>
                  <nav aria-label="Sort" className="flex flex-wrap gap-1 text-sm">{SORTS.filter(([k]) => k !== "nearest" || near).map(([k, l]) => <Link key={k} href={href({ sort: k === "relevance" ? null : k })} aria-current={(r.sort === k) ? "true" : undefined} className={`rounded-full px-3 py-1 font-bold ${r.sort === k ? "bg-ink text-yellow" : "hover:bg-yellow"}`}>{l}</Link>)}</nav></div>
                {r.items.length === 0 ? <EmptyState title="No businesses found" action={<Link href="/businesses/submit" className="font-bold underline">Suggest a business</Link>}>Try fewer words, a different spelling, or remove a filter.</EmptyState>
                  : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{r.items.map((b) => <BusinessCard key={b.id} b={b} level={3} distanceKm={b.distanceKm} approx={b.approx} open={b.open} />)}</div>}
                {r.pages > 1 && <nav aria-label="Pagination" className="mt-8 flex items-center justify-between">{page > 1 ? <Link rel="prev" href={href({ page: String(page - 1) })} className="font-bold underline">← Previous</Link> : <span />}<span className="text-sm text-grey">Page {page} of {r.pages}</span>{page < r.pages ? <Link rel="next" href={href({ page: String(page + 1) })} className="font-bold underline">Next →</Link> : <span />}</nav>}
              </section>

              {r.articles.length > 0 && <section aria-labelledby="stories"><SectionHead title="Stories & guides" /><h2 id="stories" className="sr-only">Stories and guides</h2><div className="grid gap-8 sm:grid-cols-2">{r.articles.map((a) => <ArticleCard key={a.id} a={a} level={3} />)}</div></section>}
              {r.episodes.length > 0 && <section aria-labelledby="eps"><SectionHead title="Podcast episodes" /><h2 id="eps" className="sr-only">Podcast episodes</h2><ul className="space-y-3">{r.episodes.map((e) => <li key={e.id}><Link href={`/podcast/${e.slug}`} className="flex gap-4 rounded-2xl border border-line p-4 hover:border-ink"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow font-display text-xl font-extrabold">{e.number}</span><span className="min-w-0"><span className="block font-extrabold [overflow-wrap:anywhere]">{e.title}</span><span className="block text-sm text-grey [overflow-wrap:anywhere]">{e.description.slice(0, 140)}</span><span className="text-xs text-grey">{fmtDate(e.publishedAt)} {e.isSample && <SampleBadge />}</span></span></Link></li>)}</ul></section>}
            </div>
          </div>
        )}
      </Container>
    </>
  );
}
