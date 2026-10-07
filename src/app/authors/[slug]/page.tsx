import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard, fmtDate } from "@/components/Cards";
import { Container, EmptyState, JsonLd, SectionHead } from "@/components/ui";
import { SocialIcon } from "@/components/Social";
import { db } from "@/lib/db";
import { activeSocials } from "@/lib/authors";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { abs, breadcrumbLd, meta } from "@/lib/seo";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

const load = async (slug: string) => {
  const author = await db.author.findUnique({ where: { slug } });
  if (!author) return null;
  const [articles, cities] = await Promise.all([
    db.article.findMany({
      where: { authorId: author.id, status: "PUBLISHED", publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: "desc" }, take: 36,
      include: { author: true, location: { include: { city: true } } },
    }),
    db.cityEditor.findMany({ where: { authorId: author.id }, include: { city: true } }),
  ]);
  return { author, articles, cities };
};

export async function generateMetadata({ params }: P) {
  const d = await load((await params).slug);
  if (!d) return {};
  const { author, articles } = d;
  const desc = author.bio?.trim()
    ? author.bio.trim().slice(0, 155)
    : `${articles.length} ${articles.length === 1 ? "article" : "articles"} by ${author.name} on PrimeStreet, London's business media and local directory.`;
  return meta({
    title: author.role ? `${author.name} — ${author.role}` : author.name,
    description: desc, path: `/authors/${author.slug}`,
    noindex: articles.length === 0 || articles.every((a) => a.isSample),
    image: author.imageUrl ?? undefined,
  });
}

export default async function AuthorPage({ params }: P) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const { author, articles, cities } = d;
  const socials = activeSocials(author);
  const [lead, ...rest] = articles;
  const byType = Object.entries(
    articles.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.type]: (acc[a.type] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const since = articles.length ? articles[articles.length - 1].publishedAt : null;

  return (
    <>
      <JsonLd data={[
        breadcrumbLd([{ name: "Home", path: "/" }, { name: "Authors", path: "/authors" }, { name: author.name, path: `/authors/${author.slug}` }]),
        {
          "@context": "https://schema.org", "@type": "Person", name: author.name, url: abs(`/authors/${author.slug}`),
          ...(author.role ? { jobTitle: author.role } : {}),
          ...(author.bio ? { description: author.bio } : {}),
          ...(author.imageUrl ? { image: author.imageUrl } : {}),
          ...(socials.length ? { sameAs: socials.map((s) => s.url) } : {}),
          worksFor: { "@type": "Organization", name: "PrimeStreet", url: abs("/") },
        },
      ]} />

      {/* Profile header: portrait, name, role, biography and only the social icons they have given. */}
      <section className="on-dark bg-ink text-white">
        <Container className="py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-white/60">
            <Link href="/" className="hover:text-yellow">Home</Link> <span aria-hidden>/</span>{" "}
            <Link href="/authors" className="hover:text-yellow">Authors</Link> <span aria-hidden>/</span>{" "}
            <span className="text-white">{author.name}</span>
          </nav>
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
            <div className="relative shrink-0">
              {author.imageUrl ? (
                <img src={author.imageUrl} alt={`${author.name}, portrait`} width={160} height={160}
                  className="h-32 w-32 rounded-full border-4 border-yellow object-cover sm:h-40 sm:w-40" />
              ) : (
                <span aria-hidden className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-yellow bg-white/5 font-display text-5xl font-extrabold text-yellow sm:h-40 sm:w-40">
                  {author.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {author.role && <p className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-yellow">{author.role}</p>}
              <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight sm:text-5xl">{author.name}</h1>
              {author.bio && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/80 [overflow-wrap:anywhere]">{author.bio}</p>}

              <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div><dt className="text-white/50">Published</dt><dd className="font-display text-xl font-extrabold text-yellow">{articles.length}</dd></div>
                {byType.slice(0, 3).map(([t, n]) => (
                  <div key={t}><dt className="text-white/50">{ARTICLE_TYPES[t as ArticleType]?.label ?? t}</dt><dd className="font-display text-xl font-extrabold">{n}</dd></div>
                ))}
                {since && <div><dt className="text-white/50">Writing here since</dt><dd className="font-display text-xl font-extrabold">{fmtDate(since)}</dd></div>}
              </dl>

              {cities.length > 0 && (
                <p className="mt-5 text-sm text-white/70">
                  Covers{" "}
                  {cities.map((c, i) => (
                    <span key={c.cityId}>
                      {i > 0 ? ", " : ""}
                      <Link href={`/locations/${c.city.slug}`} className="font-bold text-white underline decoration-yellow decoration-2 underline-offset-2 hover:text-yellow">{c.city.name}</Link>
                    </span>
                  ))}
                </p>
              )}

              {socials.length > 0 && (
                <div className="mt-7">
                  <h2 className="sr-only">Find {author.name} elsewhere</h2>
                  <ul aria-label={`${author.name} on social media`} className="flex flex-wrap items-center gap-2">
                    {socials.map((l) => (
                      <li key={l.key}>
                        <a href={l.url} rel="me noopener noreferrer" target="_blank" title={`${author.name} on ${l.label}`}
                          className="flex h-11 items-center gap-2 rounded-full border-2 border-white/25 px-4 text-sm font-bold text-white transition hover:border-yellow hover:bg-yellow hover:text-ink">
                          <SocialIcon icon={l.icon} size={18} />
                          <span>{l.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Container>
        <div className="h-1 bg-yellow" />
      </section>

      <Container className="py-12">
        {articles.length === 0 ? (
          <EmptyState title="Nothing published yet">When {author.name} publishes, it will appear here.</EmptyState>
        ) : (
          <>
            {lead && (
              <section className="mb-14">
                <SectionHead title="Latest" />
                <article className="grid gap-6 rounded-3xl border-2 border-ink p-6 md:grid-cols-[minmax(0,1fr)_320px] md:items-center">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-grey">
                      {ARTICLE_TYPES[lead.type as ArticleType]?.label ?? lead.type}
                      {lead.publishedAt ? <> · <time dateTime={lead.publishedAt.toISOString()}>{fmtDate(lead.publishedAt)}</time></> : null}
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
                      <Link href={`/${ARTICLE_TYPES[lead.type as ArticleType]?.path ?? "news"}/${lead.slug}`} className="hover:underline">{lead.title}</Link>
                    </h3>
                    <p className="mt-3 text-lg text-grey [overflow-wrap:anywhere]">{lead.standfirst}</p>
                  </div>
                  {lead.imageUrl && <img src={lead.imageUrl} alt={lead.imageAlt ?? ""} className="aspect-[4/3] w-full rounded-2xl object-cover" loading="lazy" />}
                </article>
              </section>
            )}
            {rest.length > 0 && (
              <section>
                <SectionHead title={`More by ${author.name}`} />
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{rest.map((a) => <ArticleCard key={a.id} a={a} level={3} />)}</div>
              </section>
            )}
          </>
        )}
      </Container>
    </>
  );
}
