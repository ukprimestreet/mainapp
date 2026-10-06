import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, BusinessCard } from "@/components/Cards";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import { Prose } from "@/components/Prose";
import { Breadcrumbs, Container, JsonLd, Label, SampleBadge, SectionHead } from "@/components/ui";
import { VideoEmbed } from "@/components/VideoEmbed";
import { SITE } from "@/lib/constants";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { countEpisodeView, fmtDuration, isoDuration, parseVideoUrl, readChapters } from "@/lib/podcast";
import { articlePath, businessInclude } from "@/lib/queries";
import { redirectIfMoved } from "@/lib/redirects";
import { AdSlot } from "@/components/Sponsored";
import { relatedEpisodes } from "@/lib/related";
import { abs, breadcrumbLd } from "@/lib/seo";
import { decideEpisode, getSeoPage } from "@/lib/seo-engine";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

const load = (slug: string) =>
  db.podcastEpisode.findFirst({
    where: { slug, status: "PUBLISHED", publishedAt: { lte: new Date() } },
    include: { article: true, business: { include: businessInclude }, clips: { where: { kind: "QUOTE" }, orderBy: { createdAt: "asc" } } },
  });

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const e = await load((await params).slug);
  if (!e) return {};
  const path = `/podcast/${e.slug}`;
  const override = await getSeoPage(path);
  const v = decideEpisode(e, override);
  const title = override?.title?.trim() || e.title;
  const description = override?.description?.trim() || e.description.slice(0, 160);
  return {
    title, description, alternates: { canonical: abs(path) },
    robots: v.index ? { index: true, follow: true, "max-image-preview": "large" } : { index: false, follow: true },
    openGraph: { title, description, url: abs(path), siteName: "PrimeStreet", type: "article", locale: "en_GB", images: [e.imageUrl ?? abs(`${path}/opengraph-image`)] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EpisodePage({ params }: P) {
  const { slug } = await params;
  const e = await load(slug);
  if (!e) { await redirectIfMoved(`/podcast/${slug}`); notFound(); }
  if (!(await isAdmin())) await countEpisodeView(e.id, (await headers()).get("user-agent"));
  const path = `/podcast/${e.slug}`, url = abs(path);
  const chapters = readChapters(e.chapters);
  const video = parseVideoUrl(e.videoUrl);
  const related = await relatedEpisodes({ id: e.id, businessId: e.businessId, guestName: e.guestName, isSample: e.isSample }, 3);
  const now = new Date();
  const sponsors = await db.sponsorship.findMany({ where: { kind: "PODCAST", status: "ACTIVE", episodeId: e.id, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } });
  const poster = e.imageUrl ?? abs(`${path}/opengraph-image`);

  const ld: object[] = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Podcast", path: "/podcast" }, { name: e.title, path }]),
    {
      "@context": "https://schema.org", "@type": "PodcastEpisode", name: e.title, description: e.description, url, episodeNumber: e.number, datePublished: e.publishedAt?.toISOString(),
      ...(e.durationSec ? { timeRequired: isoDuration(e.durationSec) } : {}),
      partOfSeries: { "@type": "PodcastSeries", name: "The PrimeStreet Podcast", url: abs("/podcast") },
      ...(e.audioUrl ? { associatedMedia: { "@type": "AudioObject", contentUrl: e.audioUrl, encodingFormat: e.audioMime, ...(e.durationSec ? { duration: isoDuration(e.durationSec) } : {}) } } : {}),
      ...(chapters.length ? { hasPart: chapters.map((c, i) => ({ "@type": "Clip", name: c.title, startOffset: c.t, ...(chapters[i + 1] ? { endOffset: chapters[i + 1].t } : {}), url: `${url}#t=${c.t}` })) } : {}),
      publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
    },
  ];
  if (video) ld.push({ "@context": "https://schema.org", "@type": "VideoObject", name: e.title, description: e.description, thumbnailUrl: poster, uploadDate: e.publishedAt?.toISOString(), ...(video.embedUrl ? { embedUrl: video.embedUrl } : { contentUrl: video.fileUrl }), ...(e.durationSec ? { duration: isoDuration(e.durationSec) } : {}) });

  return (
    <>
      <JsonLd data={ld} />
      <section className="on-dark bg-ink text-white"><Container className="max-w-4xl py-12">
        <Breadcrumbs dark items={[{ name: "Home", href: "/" }, { name: "Podcast", href: "/podcast" }, { name: `Episode ${e.number}` }]} />
        <div className="mt-6 flex flex-wrap items-center gap-2"><Label>{e.episodeType === "full" ? `${e.season ? `Season ${e.season} · ` : ""}Episode ${e.number}` : e.episodeType === "trailer" ? "Trailer" : "Bonus"}</Label>{video && <Label>Video</Label>}{e.explicit && <span className="rounded border border-white/60 px-2 py-0.5 text-xs font-bold uppercase">Explicit</span>}{e.isSample && <SampleBadge dark />}</div>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">{e.title}</h1>
        <p className="mt-4 text-white/80">{e.guestName && <>With <strong className="text-white">{e.guestName}</strong>{e.guestRole ? `, ${e.guestRole}` : ""} · </>}<time dateTime={e.publishedAt?.toISOString()}>{fmtDate(e.publishedAt)}</time>{e.durationSec ? ` · ${fmtDuration(e.durationSec)}` : ""}</p>
      </Container></section>

      <Container className="max-w-4xl space-y-10 py-10">
        {e.audioUrl ? <EpisodePlayer slug={e.slug} audioUrl={e.audioUrl} mime={e.audioMime} chapters={chapters} /> : null}
        {sponsors.length > 0 && <aside aria-label="Episode sponsor" data-sponsored="sponsorship" className="rounded-2xl border-2 border-dashed border-ink/40 bg-yellow-soft p-4 text-sm font-semibold"><span className="mr-2 rounded bg-ink px-2 py-0.5 text-xs font-extrabold uppercase text-yellow">Sponsored</span>This episode is sponsored by {sponsors.map((x, i) => <span key={x.id}>{i ? ", " : ""}{x.website ? <a className="underline" rel="sponsored nofollow noopener" href={x.website}>{x.sponsorName}</a> : x.sponsorName}</span>)}. PrimeStreet&apos;s editorial choices are independent of sponsors.</aside>}
        {video && <section aria-label="Video"><VideoEmbed video={video} title={e.title} /></section>}
        {!e.audioUrl && !video && <p className="rounded-xl border-2 border-dashed border-line bg-mist p-6 text-grey">Audio will appear here when the episode is published.</p>}
        <p className="text-xl leading-relaxed [overflow-wrap:anywhere]">{e.description}</p>
        {e.showNotes && <section aria-labelledby="notes"><h2 id="notes" className="mb-3 text-2xl font-extrabold">Show notes</h2><Prose text={e.showNotes} /></section>}

        {e.clips.length > 0 && (
          <section aria-labelledby="highlights"><h2 id="highlights" className="mb-4 text-2xl font-extrabold">Highlights</h2>
            <ul className="space-y-4">{e.clips.map((c) => (
              <li key={c.id}><blockquote className="border-l-8 border-yellow pl-5 text-xl font-bold leading-snug [overflow-wrap:anywhere]">“{c.quote}”<footer className="mt-1 text-sm font-normal text-grey">{c.speaker ? `— ${c.speaker}` : ""}{c.startSec != null ? ` · ${fmtDuration(c.startSec)}` : ""} · <a className="underline" href={`${path}/quote/${c.id}`}>Share image</a></footer></blockquote></li>))}</ul></section>
        )}

        {(e.article || e.business) && (
          <section aria-labelledby="more" className="grid gap-6 sm:grid-cols-2"><h2 id="more" className="sr-only">Related</h2>
            {e.article && <div className="rounded-2xl bg-mist p-6"><p className="text-sm font-bold uppercase tracking-wide text-grey">Prefer to read?</p><Link href={articlePath(e.article)} className="mt-1 block text-xl font-extrabold underline decoration-yellow decoration-4 underline-offset-4">{e.article.title}</Link></div>}
            {e.business && <div><BusinessCard b={e.business} /></div>}
          </section>
        )}

        {e.transcript && (
          <section aria-labelledby="transcript"><details className="rounded-2xl border-2 border-line p-5"><summary id="transcript" className="cursor-pointer font-display text-2xl font-extrabold">Read the transcript</summary>
            <div className="mt-4"><Prose text={e.transcript} /></div></details></section>
        )}

        <AdSlot placement="PODCAST" />
        {related.length > 0 && (
          <section aria-labelledby="related"><SectionHead title="More episodes" href="/podcast" /><h2 id="related" className="sr-only">More episodes</h2>
            <ul className="grid gap-4 sm:grid-cols-3">{related.map((r) => <li key={r.id}><Link href={`/podcast/${r.slug}`} className="block h-full rounded-2xl border border-line p-4 hover:border-ink"><span className="text-xs font-bold uppercase text-grey">Episode {r.number}</span><span className="mt-1 block font-extrabold [overflow-wrap:anywhere]">{r.title}</span></Link></li>)}</ul></section>
        )}
      </Container>
    </>
  );
}
