import Link from "next/link";
import { ArticleCard, BusinessCard } from "@/components/Cards";
import { Button, Container, EmptyState, SectionHead } from "@/components/ui";
import { db } from "@/lib/db";
import { businessInclude, latestArticles } from "@/lib/queries";
import { meta } from "@/lib/seo";
import { AdSlot } from "@/components/Sponsored";
import { cookies } from "next/headers";
import { recommendFor } from "@/lib/related";
import { MAX_RECENT, MAX_SAVED, RECENT_COOKIE, SAVED_COOKIE, parseIds } from "@/lib/saved";
import { SITE } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = meta({ title: `${SITE.name} — ${SITE.tagline}`, description: SITE.description, path: "/" });

export default async function Home() {
  const jar = await cookies();
  const mine = await recommendFor(parseIds(jar.get(SAVED_COOKIE)?.value, MAX_SAVED), parseIds(jar.get(RECENT_COOKIE)?.value, MAX_RECENT), 3);
  const [lead, news, stories, interviews, botw, featured, locs, cats, ep] = await Promise.all([
    db.article.findFirst({ where: { status: "PUBLISHED", featured: true, type: { not: "BOTW" }, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" }, include: { author: true, location: true } }),
    latestArticles("NEWS", 4), latestArticles("STORY", 3), latestArticles("INTERVIEW", 3),
    db.article.findFirst({ where: { type: "BOTW", status: "PUBLISHED", publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" }, include: { businesses: { include: { business: { include: businessInclude } } } } }),
    db.business.findMany({ where: { published: true }, include: businessInclude, orderBy: [{ isFeatured: "desc" }, { name: "asc" }], take: 6 }),
    db.location.findMany({ where: { businesses: { some: {} } }, include: { _count: { select: { businesses: true } } }, orderBy: { businesses: { _count: "desc" } }, take: 8 }),
    db.category.findMany({ include: { _count: { select: { businesses: true } } }, orderBy: { name: "asc" } }),
    db.podcastEpisode.findFirst({ where: { status: "PUBLISHED" }, orderBy: { number: "desc" } }),
  ]);
  const botwBiz = botw?.businesses[0]?.business;
  return (
    <>
      <section className="on-dark bg-ink text-white">
        <Container className="grid grid-cols-1 gap-10 py-14 sm:py-20 lg:grid-cols-[1.3fr_1fr] lg:items-center [&>*]:min-w-0">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-yellow">London business media</p>
            <h1 className="mt-4 text-5xl font-extrabold leading-[0.95] sm:text-7xl">London&apos;s <span className="text-yellow">Businesses.</span> Stories. People.</h1>
            <p className="mt-6 max-w-xl text-lg text-white/80">We tell the stories of the businesses, entrepreneurs and people shaping London — and help you discover them.</p>
            <form action="/search" method="get" role="search" className="mt-8 flex max-w-xl gap-2">
              <label htmlFor="home-q" className="sr-only">Search London businesses</label>
              <input id="home-q" name="q" placeholder="Search cleaners, cafes, barbers…" className="min-h-12 min-w-0 flex-1 rounded-full bg-white px-5 text-base text-ink" />
              <button className="min-h-12 rounded-full bg-yellow px-6 font-bold text-ink hover:bg-yellow-hover">Search</button>
            </form>
          </div>
          {lead && <div className="rounded-2xl bg-white p-5 text-ink"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-grey">Top story</p><ArticleCard a={lead} large level={2} /></div>}
        </Container>
        <div className="h-2 bg-yellow" />
      </section>

      {mine.items.length > 0 && (
        <Container className="mt-16"><SectionHead title={`Picked for you — because ${mine.because}`} href="/saved" linkText="Your saved list" />
          <div className="grid gap-5 sm:grid-cols-3">{mine.items.map((b) => <BusinessCard key={b.id} b={b} />)}</div></Container>
      )}
      <Container className="mt-16"><SectionHead title="Latest news" href="/news" />
        {news.length ? <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">{news.map((a) => <ArticleCard key={a.id} a={a} />)}</div> : <EmptyState title="News is on its way" />}
      </Container>

      {botw && botwBiz && (
        <section className="mt-16 bg-yellow">
          <Container className="grid gap-6 py-12 md:grid-cols-[1fr_auto] md:items-center">
            <div><p className="text-sm font-extrabold uppercase tracking-widest">Business of the Week</p>
              <h2 className="mt-2 text-4xl font-extrabold sm:text-5xl">{botwBiz.name}</h2>
              <p className="mt-2 max-w-xl text-lg font-medium">{botw.standfirst}</p></div>
            <Button href={`/business-of-the-week/${botw.slug}`} variant="dark">Read the feature</Button>
          </Container>
        </section>
      )}

      <Container className="mt-16"><AdSlot placement="HOME" /></Container>
      <Container className="mt-16"><SectionHead title="Discover businesses" href="/businesses" />
        {featured.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((b) => <BusinessCard key={b.id} b={b} />)}</div> : <EmptyState title="Directory is filling up" />}
        <ul className="mt-8 flex flex-wrap gap-3">{cats.map((c) => <li key={c.id}><Link href={`/businesses/london/${c.slug}`} className="inline-block rounded-full border-2 border-ink px-4 py-2 text-sm font-bold hover:bg-yellow">{c.name}</Link></li>)}</ul>
      </Container>

      <Container className="mt-16"><SectionHead title="Stories and interviews" href="/stories" />
        <div className="grid gap-8 sm:grid-cols-3">{[...stories, ...interviews].slice(0, 3).map((a) => <ArticleCard key={a.id} a={a} />)}</div>
      </Container>

      <Container className="mt-16"><SectionHead title="Explore London" href="/locations" />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{locs.map((l) => <li key={l.id}><Link href={`/locations/${l.slug}`} className="flex items-center justify-between rounded-xl border border-line px-4 py-4 font-bold hover:border-ink hover:bg-yellow"><span>{l.name}</span><span className="text-sm text-grey">{l._count.businesses}</span></Link></li>)}</ul>
      </Container>

      {ep && (
        <section className="on-dark mt-16 bg-ink text-white"><Container className="flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold uppercase tracking-widest text-yellow">The PrimeStreet Podcast</p><p className="mt-1 text-2xl font-extrabold">{ep.title}</p></div>
          <Button href={`/podcast/${ep.slug}`}>Listen</Button></Container></section>
      )}

      <section className="mt-16 border-y-4 border-ink bg-yellow">
        <Container className="flex flex-col gap-5 py-12 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-3xl font-extrabold sm:text-4xl">Own a London business?</h2><p className="mt-2 max-w-xl font-medium">Claim your free profile to keep details accurate, add photos and respond to reviews.</p></div>
          <Button href="/claim" variant="dark">Claim your business</Button>
        </Container>
      </section>
    </>
  );
}
