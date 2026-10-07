import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ARTICLE_TYPES, DISCLOSURE, SITE, type ArticleType, type Disclosure } from "@/lib/constants";
import { db } from "@/lib/db";
import { readingMinutes } from "@/lib/editorial";
import { articlePath, latestArticles } from "@/lib/queries";
import { abs, breadcrumbLd, meta } from "@/lib/seo";
import { redirectIfMoved } from "@/lib/redirects";
import { AdSlot } from "./Sponsored";
import { relatedArticles } from "@/lib/related";
import { ArticleCard, BusinessCard, fmtDate } from "./Cards";
import { Prose } from "./Prose";
import { Avatar, SocialLinks } from "./Social";
import { Breadcrumbs, Button, Container, DisclosureBadge, EmptyState, JsonLd, Label, PageHeader, SampleBadge, SectionHead } from "./ui";

const PER_PAGE = 18;

export function hubMetadata(type: ArticleType): Metadata {
  const t = ARTICLE_TYPES[type];
  return meta({ title: `${t.label} — London business`, description: `${t.blurb} The latest from PrimeStreet's London business coverage.`, path: `/${t.path}` });
}

export async function Hub({ type, page = 1 }: { type: ArticleType; page?: number }) {
  const t = ARTICLE_TYPES[type];
  const where = { status: "PUBLISHED", publishedAt: { lte: new Date() }, type } as const;
  const [total, items] = await Promise.all([
    db.article.count({ where }),
    db.article.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, include: { author: true, location: { include: { city: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (n: number) => `/${t.path}${n > 1 ? `?page=${n}` : ""}`;
  return (
    <>
      <PageHeader ld kicker="PrimeStreet" title={t.label} intro={t.blurb} crumbs={[{ name: "Home", href: "/" }, { name: t.label }]} />
      <Container className="py-12">
        {items.length === 0 ? (
          <EmptyState title={`No ${t.label.toLowerCase()} published yet`} action={<Button href="/">Back to home</Button>}>
            We publish here as soon as stories are ready. Check back soon.
          </EmptyState>
        ) : (
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a, i) => <ArticleCard key={a.id} a={a} level={2} large={page === 1 && i === 0 && items.length > 2} />)}
          </div>
        )}
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-12 flex items-center justify-between">
            {page > 1 ? <Link href={href(page - 1)} rel="prev" className="font-bold underline">← Newer</Link> : <span />}
            <span className="text-sm text-grey">Page {page} of {pages}</span>
            {page < pages ? <Link href={href(page + 1)} rel="next" className="font-bold underline">Older →</Link> : <span />}
          </nav>
        )}
      </Container>
    </>
  );
}

export const articleInclude = {
  author: true, location: { include: { city: true } }, episode: true,
  businesses: { include: { business: { include: { category: true, location: true, city: true } } } },
} as const;

async function load(type: ArticleType, slug: string) {
  return db.article.findFirst({ where: { slug, type, status: "PUBLISHED", publishedAt: { lte: new Date() } }, include: articleInclude });
}

export async function articleMetadata(type: ArticleType, slug: string): Promise<Metadata> {
  const a = await load(type, slug);
  if (!a) return {};
  return meta({ title: a.seoTitle ?? a.title, description: a.seoDescription ?? a.standfirst, path: articlePath(a), type: "article", noindex: a.isSample, image: a.imageUrl ?? abs(`${articlePath(a)}/opengraph-image`) });
}

export async function ArticlePage({ type, slug }: { type: ArticleType; slug: string }) {
  const a = await load(type, slug);
  if (!a) { await redirectIfMoved(`/${ARTICLE_TYPES[type].path}/${slug}`); notFound(); }
  return <ArticleView a={a} />;
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

export async function ArticleView({ a, preview = false }: { a: Loaded; preview?: boolean }) {
  const type = a.type as ArticleType;
  const t = ARTICLE_TYPES[type];
  const path = articlePath(a);
  const biz = a.businesses.map((x) => x.business);
  const founder = biz.some((b) => b.ownedByFounder);
  const bizIds = biz.map((b) => b.id);
  // related: shares a linked business, else same area, else latest
  const related = preview ? [] : await relatedArticles({ id: a.id, type: a.type, locationId: a.locationId, title: a.title, publishedAt: a.publishedAt, isSample: a.isSample, businesses: a.businesses }, 3);
  const disc = DISCLOSURE[a.disclosure as Disclosure];
  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: t.label, path: `/${t.path}` }, { name: a.title, path }]),
    {
      "@context": "https://schema.org", "@type": type === "NEWS" ? "NewsArticle" : "Article",
      headline: a.title, description: a.standfirst, datePublished: a.publishedAt?.toISOString(), dateModified: a.updatedAt.toISOString(),
      ...(a.imageUrl ? { image: [a.imageUrl] } : {}),
      author: { "@type": "Person", name: a.author.name, url: abs(`/authors/${a.author.slug}`) }, publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
      mainEntityOfPage: abs(path),
    },
  ];
  return (
    <>
      {!preview && <JsonLd data={ld} />}
      <article>
        <header className="border-b border-line bg-mist">
          <Container className="max-w-3xl py-10 sm:py-14">
            <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: t.label, href: `/${t.path}` }, { name: a.title }]} />
            <div className="mt-6 flex flex-wrap items-center gap-2"><Label>{t.label}</Label><DisclosureBadge kind={a.disclosure} />{a.isSample && <SampleBadge />}</div>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] sm:text-5xl">{a.title}</h1>
            <p className="mt-4 text-xl text-grey">{a.standfirst}</p>
            <div className="mt-6 flex items-center gap-3">
              <Link href={`/authors/${a.author.slug}`} aria-label={`${a.author.name}'s profile`} className="shrink-0">
                <Avatar src={a.author.imageUrl} name={a.author.name} size={48} />
              </Link>
              <p className="text-sm text-grey">
                By <Link href={`/authors/${a.author.slug}`} className="font-bold text-ink underline decoration-yellow decoration-2 underline-offset-2">{a.author.name}</Link>
                {a.author.role ? <span className="text-grey">, {a.author.role}</span> : null}
                <br className="sm:hidden" />
                <span className="max-sm:hidden"> · </span>
                <time dateTime={a.publishedAt?.toISOString()}>{fmtDate(a.publishedAt)}</time> · {readingMinutes(a.body)} min read
                {a.location && <> · <Link className="underline" href={`/locations/${a.location.city.slug}/${a.location.slug}`}>{a.location.name}</Link></>}
              </p>
            </div>
          </Container>
        </header>
        {a.imageUrl && (
          <Container className="mt-8 max-w-4xl"><figure><img src={a.imageUrl} alt={a.imageAlt ?? ""} className="aspect-[16/9] w-full rounded-2xl object-cover" />{a.imageCredit && <figcaption className="mt-2 text-xs text-grey">Photo: {a.imageCredit}</figcaption>}</figure></Container>
        )}
        <Container className="max-w-3xl py-10">
          {a.disclosure !== "EDITORIAL" && (
            <p role="note" className="mb-8 rounded-xl border-2 border-ink bg-yellow-soft p-4 text-sm font-semibold">
              <strong>{disc.label} content.</strong> {disc.note}{a.sponsorName ? ` Sponsor/partner: ${a.sponsorName}.` : ""}
            </p>
          )}
          {founder && (
            <p role="note" className="mb-8 rounded-xl border-2 border-ink p-4 text-sm font-semibold">
              Disclosure: a business featured here is owned by PrimeStreet&apos;s founder.
            </p>
          )}
          <Prose text={a.body} />
          {!preview && a.disclosure === "EDITORIAL" && <div className="mt-10"><AdSlot placement="ARTICLE" /></div>}
          {a.episode && a.episode.status === "PUBLISHED" && !!a.episode.publishedAt && a.episode.publishedAt.getTime() <= Date.now() && (
            <p className="mt-8 rounded-xl bg-ink p-5 text-white">Also a podcast episode: <Link className="font-bold text-yellow underline" href={`/podcast/${a.episode.slug}`}>{a.episode.title}</Link></p>
          )}
        </Container>
      </article>
      {/* Who wrote this: portrait, biography and only the social links the author has given. */}
      <Container className="mt-12 max-w-3xl">
        <aside aria-labelledby="about-author" className="rounded-3xl border-2 border-ink p-6 sm:p-8">
          <h2 id="about-author" className="sr-only">About the author</h2>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Link href={`/authors/${a.author.slug}`} aria-label={`${a.author.name}'s profile`} className="shrink-0">
              <Avatar src={a.author.imageUrl} name={a.author.name} size={88} />
            </Link>
            <div className="min-w-0">
              <p className="font-display text-xl font-extrabold">
                <Link href={`/authors/${a.author.slug}`} className="hover:underline">{a.author.name}</Link>
              </p>
              {a.author.role && <p className="text-sm font-bold uppercase tracking-wider text-grey">{a.author.role}</p>}
              {a.author.bio && <p className="mt-3 text-grey [overflow-wrap:anywhere]">{a.author.bio}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href={`/authors/${a.author.slug}`} className="font-bold underline decoration-yellow decoration-2 underline-offset-2">All articles by {a.author.name.split(" ")[0]} →</Link>
                <SocialLinks author={a.author} size={38} />
              </div>
            </div>
          </div>
        </aside>
      </Container>
      {biz.length > 0 && (
        <Container className="mt-6"><SectionHead title="Businesses in this story" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{biz.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
        </Container>
      )}
      {related.length > 0 && (
        <Container className="mt-14"><SectionHead title="More from PrimeStreet" />
          <div className="grid gap-8 sm:grid-cols-3">{related.map((r) => <ArticleCard key={r.id} a={r} />)}</div>
        </Container>
      )}
    </>
  );
}
