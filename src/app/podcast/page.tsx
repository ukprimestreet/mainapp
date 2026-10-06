import Link from "next/link";
import type { Metadata } from "next";
import { fmtDate } from "@/components/Cards";
import { Pagination } from "@/components/Listing";
import { Container, EmptyState, JsonLd, PageHeader, SampleBadge } from "@/components/ui";
import { SITE } from "@/lib/constants";
import { db } from "@/lib/db";
import { fmtDuration, getShow } from "@/lib/podcast";
import { abs, breadcrumbLd } from "@/lib/seo";

export const dynamic = "force-dynamic";
const PER = 20;
type SP = { searchParams: Promise<{ format?: string; page?: string }> };

export async function generateMetadata({ searchParams }: SP): Promise<Metadata> {
  const sp = await searchParams;
  const show = await getShow();
  const filtered = !!sp.format || (!!sp.page && sp.page !== "1");
  return {
    title: show.title, description: `${show.description} Listen, watch or read every episode on PrimeStreet.`.slice(0, 160),
    alternates: { canonical: abs("/podcast"), types: { "application/rss+xml": [{ url: "/podcast/feed.xml", title: show.title }] } },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: { title: show.title, description: show.description, url: abs("/podcast"), siteName: "PrimeStreet", type: "website", locale: "en_GB", images: [show.imageUrl ?? abs("/opengraph-image")] },
  };
}

export default async function PodcastPage({ searchParams }: SP) {
  const { format = "", page: pr = "1" } = await searchParams;
  const page = Math.max(1, Math.min(100, parseInt(pr, 10) || 1));
  const show = await getShow();
  const where = { status: "PUBLISHED", publishedAt: { lte: new Date() }, ...(format === "video" ? { videoUrl: { not: null } } : format === "audio" ? { audioUrl: { not: null } } : {}) } as const;
  const [total, eps] = await Promise.all([db.podcastEpisode.count({ where }), db.podcastEpisode.findMany({ where, orderBy: [{ publishedAt: "desc" }, { number: "desc" }], skip: (page - 1) * PER, take: PER })]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const listen = [["Spotify", show.spotifyUrl], ["Apple Podcasts", show.appleUrl], ["YouTube", show.youtubeUrl]].filter(([, u]) => u) as [string, string][];
  const tab = (k: string, label: string) => <Link key={k} href={k ? `/podcast?format=${k}` : "/podcast"} aria-current={format === k ? "page" : undefined} className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${format === k ? "border-ink bg-ink text-yellow" : "border-line"}`}>{label}</Link>;
  return (
    <>
      <JsonLd data={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Podcast", path: "/podcast" }]), { "@context": "https://schema.org", "@type": "PodcastSeries", name: show.title, description: show.description, url: abs("/podcast"), webFeed: abs("/podcast/feed.xml"), publisher: { "@type": "Organization", name: SITE.name, url: SITE.url } }]} />
      <PageHeader kicker="Podcast & video" title={show.title} intro={`${show.description} Every episode also exists as a written interview where we have one.`} crumbs={[{ name: "Home", href: "/" }, { name: "Podcast" }]} />
      <Container className="py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3"><span className="font-bold">Listen on</span>
          {listen.map(([n, u]) => <a key={n} href={u} rel="noopener" className="inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 font-bold hover:bg-yellow">{n}</a>)}
          <a href="/podcast/feed.xml" className="inline-flex min-h-11 items-center rounded-full bg-yellow px-5 font-bold hover:bg-yellow-hover">RSS feed</a></div>
        <nav aria-label="Format" className="mb-8 flex flex-wrap gap-2">{tab("", "All episodes")}{tab("video", "Video")}{tab("audio", "Audio")}</nav>
        {eps.length === 0 ? <EmptyState title={format ? "No episodes in this format yet" : "First episodes coming soon"} /> : (
          <ul className="space-y-4">{eps.map((e) => (
            <li key={e.id}><Link href={`/podcast/${e.slug}`} className="flex gap-5 rounded-2xl border border-line p-5 hover:border-ink">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-yellow font-display text-2xl font-extrabold">{e.number}</span>
              <span className="min-w-0"><span className="block text-xl font-extrabold [overflow-wrap:anywhere]">{e.title}</span><span className="mt-1 block text-grey [overflow-wrap:anywhere]">{e.description}</span>
                <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-grey">{fmtDate(e.publishedAt)}{e.durationSec ? <span>{fmtDuration(e.durationSec)}</span> : null}{e.videoUrl && <span className="font-bold text-ink">▶ Video</span>}{e.transcript && <span>Transcript</span>}{e.isSample && <SampleBadge />}</span></span></Link></li>
          ))}</ul>
        )}
        <Pagination basePath={format ? `/podcast?format=${format}` : "/podcast"} page={page} pages={pages} />
      </Container>
    </>
  );
}
