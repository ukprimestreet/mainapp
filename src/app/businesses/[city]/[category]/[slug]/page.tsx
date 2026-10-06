import Link from "next/link";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { countView } from "@/lib/owner";
import { ArticleCard, BusinessCard } from "@/components/Cards";
import { ReviewsSection, RatingBadge } from "@/components/Reviews";
import { LeadForm } from "@/components/LeadForm";
import { PhoneLink } from "@/components/PhoneLink";
import { formToken } from "@/lib/antispam";
import { getEntitlements, parseGallery } from "@/lib/commerce";
import { Button, Breadcrumbs, ClaimBadge, Container, JsonLd, SampleBadge, SectionHead, Thumb } from "@/components/ui";
import { DAYS } from "@/lib/constants";
import { db } from "@/lib/db";
import { bizPath, businessInclude, parseJson } from "@/lib/queries";
import { abs, breadcrumbLd } from "@/lib/seo";
import { decideBusiness, getSeoPage } from "@/lib/seo-engine";
import { redirectIfMoved } from "@/lib/redirects";
import { relatedBusinesses } from "@/lib/related";
import { SaveButton, TrackView } from "@/components/SaveButton";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ city: string; category: string; slug: string }> };

const load = (slug: string) =>
  db.business.findFirst({
    where: { slug, published: true },
    include: { ...businessInclude, articles: { include: { article: { include: { location: true } } } }, episodes: { where: { status: "PUBLISHED", publishedAt: { lte: new Date() } }, orderBy: { number: "desc" } } },
  });

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const b = await load((await params).slug);
  if (!b) return {};
  const path = bizPath(b);
  const override = await getSeoPage(path);
  const verdict = decideBusiness(b, override); // thin / sample / unpublished profiles are noindex; overrides respected
  const title = override?.title?.trim() || `${b.name} — ${b.category.name} in ${b.location.name}`;
  const description = override?.description?.trim() || b.summary;
  return {
    title, description, alternates: { canonical: abs(path) },
    robots: verdict.index ? { index: true, follow: true, "max-image-preview": "large" } : { index: false, follow: true },
    openGraph: { title, description, url: abs(path), siteName: "PrimeStreet", type: "website", locale: "en_GB", images: [b.imageUrl ?? abs(`${path}/opengraph-image`)] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BusinessPage({ params }: P) {
  const p = await params;
  const b = await load(p.slug);
  if (!b) { await redirectIfMoved(`/businesses/${p.city}/${p.category}/${p.slug}`); notFound(); }
  if (b.city.slug !== p.city || b.category.slug !== p.category) permanentRedirect(bizPath(b)); // one canonical URL per business

  if (!(await isAdmin())) await countView(b.id, (await headers()).get("user-agent")); // human views only, never admins
  const ent = await getEntitlements(b.id);
  const gallery = ent.premium ? parseGallery(b.gallery) : [];
  const hours = parseJson<Record<string, string>>(b.openingHours, {});
  const services = parseJson<string[]>(b.services, []);
  const articles = b.articles.map((x) => x.article).filter((a) => a.status === "PUBLISHED");
  const related = await relatedBusinesses(b, 6);
  const reviewRows = await db.review.findMany({ where: { businessId: b.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 10 });
  const reviewLd = reviewRows.map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.authorName }, datePublished: r.createdAt.toISOString().slice(0, 10), reviewBody: r.body, ...(r.title ? { name: r.title } : {}), reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 } }));
  const claimed = b.claimStatus === "CLAIMED" || b.claimStatus === "VERIFIED";
  const path = bizPath(b);
  const dayName = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" } as const;

  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Businesses", path: "/businesses" }, { name: b.city.name, path: `/businesses/${b.city.slug}` }, { name: b.category.name, path: `/businesses/${b.city.slug}/${b.category.slug}` }, { name: b.name, path }]),
    {
      "@context": "https://schema.org", "@type": "LocalBusiness", "@id": abs(path), name: b.name, description: b.summary, url: abs(path),
      ...(b.phone ? { telephone: b.phone } : {}),
      ...(b.imageUrl ? { image: b.imageUrl } : {}),
      ...(b.founded ? { foundingDate: String(b.founded) } : {}),
      ...([b.website, b.instagram, b.facebook, b.linkedin].filter(Boolean).length ? { sameAs: [b.website, b.instagram, b.facebook, b.linkedin].filter(Boolean) } : {}),
      areaServed: { "@type": "AdministrativeArea", name: b.areasServed || b.location.name },
      ...(Object.keys(hours).length ? { openingHoursSpecification: Object.entries(hours).filter(([, v]) => /^dd:dd-dd:dd$/.test(v)).map(([d, v]) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: dayName[d as keyof typeof dayName], opens: v.split("-")[0], closes: v.split("-")[1] })) } : {}),
      address: { "@type": "PostalAddress", addressLocality: b.location.name, addressRegion: "London", addressCountry: "GB", ...(b.postcode ? { postalCode: b.postcode } : {}), ...(b.address ? { streetAddress: b.address } : {}) },
      // aggregateRating only from real, published, moderated reviews that are visible on this page.
      ...(b.ratingCount > 0 && b.ratingAvg ? { aggregateRating: { "@type": "AggregateRating", ratingValue: b.ratingAvg, reviewCount: b.ratingCount, bestRating: 5, worstRating: 1 } } : {}),
      ...(reviewLd.length ? { review: reviewLd } : {}),
    },
  ];

  return (
    <>
      <JsonLd data={ld} />
      <section className="on-dark bg-ink text-white">
        <Container className="py-10">
          <div><Breadcrumbs dark items={[{ name: "Home", href: "/" }, { name: "Businesses", href: "/businesses" }, { name: b.city.name, href: `/businesses/${b.city.slug}` }, { name: b.category.name, href: `/businesses/${b.city.slug}/${b.category.slug}` }, { name: b.name }]} /></div>
          <TrackView id={b.id} />
          <div className="mt-6 flex flex-wrap items-center gap-2"><ClaimBadge status={b.claimStatus} /><span className="text-white [&_*]:!text-white"><RatingBadge avg={b.ratingAvg} count={b.ratingCount} /></span>{b.isSample && <SampleBadge dark />}</div>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] sm:text-6xl">{b.name}</h1>
          <div className="mt-4"><SaveButton id={b.id} name={b.name} /></div>
          <p className="mt-3 max-w-2xl text-lg text-white/80">{b.summary}</p>
          <p className="mt-2 text-sm text-white/60">{b.category.name} · <Link className="underline hover:text-yellow" href={`/locations/${b.location.slug}`}>{b.location.name}</Link>{b.founded ? ` · Est. ${b.founded}` : ""}</p>
        </Container>
      </section>

      <Container className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-12">
          {b.imageUrl && <img src={b.imageUrl} alt={`${b.name}`} className="aspect-video w-full rounded-2xl object-cover" />}
          {ent.premium && b.promoText && (
            <aside aria-label={`Offer from ${b.name}`} data-premium="promo" className="rounded-2xl border-2 border-ink bg-yellow-soft p-5"><p className="text-xs font-extrabold uppercase tracking-wider">Offer from {b.name}</p><p className="mt-1 text-lg font-bold [overflow-wrap:anywhere]">{b.promoText}</p>{b.promoUrl && <a className="mt-2 inline-block font-bold underline" rel="sponsored nofollow noopener" href={b.promoUrl}>Find out more →</a>}</aside>
          )}
          {gallery.length > 0 && (
            <section aria-label={`Photos of ${b.name}`} data-premium="gallery"><ul className="grid gap-2 sm:grid-cols-3">{gallery.map((u, i) => <li key={u}><img src={u} alt={`${b.name} photo ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /></li>)}</ul></section>
          )}
          <section aria-labelledby="about"><h2 id="about" className="mb-3 text-2xl font-extrabold">About</h2><p className="whitespace-pre-line text-lg leading-relaxed [overflow-wrap:anywhere]">{b.description}</p></section>
          {services.length > 0 && (
            <section aria-labelledby="services"><h2 id="services" className="mb-3 text-2xl font-extrabold">Services</h2>
              <ul className="flex flex-wrap gap-2">{services.map((s) => <li key={s} className="rounded-full border-2 border-ink px-4 py-1.5 font-semibold">{s}</li>)}</ul></section>
          )}
          {b.areasServed && <section aria-labelledby="areas"><h2 id="areas" className="mb-3 text-2xl font-extrabold">Areas served</h2><p>{b.areasServed}</p></section>}
          <ReviewsSection business={b} />
          {articles.length > 0 && (<section><SectionHead title={`${b.name} on PrimeStreet`} />
            <div className="grid gap-8 sm:grid-cols-2">{articles.map((a) => <ArticleCard key={a.id} a={a} />)}</div></section>)}
        </div>

        <aside className="space-y-6">
          {!claimed && (
            <div className="rounded-2xl bg-yellow p-6 text-ink">
              <p className="font-display text-2xl font-extrabold leading-tight">Is this your business?</p>
              <p className="mt-2 text-sm font-medium">This profile was added by PrimeStreet and hasn&apos;t been verified or approved by the owner. Claim it to update details, add photos and respond to reviews.</p>
              <Link href={`/claim?business=${b.slug}`} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-6 font-bold text-yellow hover:bg-charcoal">Claim this profile</Link>
            </div>
          )}
          <div className="rounded-2xl border border-line p-6">
            <h2 className="mb-3 font-display text-lg font-extrabold">Details</h2>
            <dl className="space-y-3 text-sm">
              {b.address && <div><dt className="font-bold">Address</dt><dd>{b.address}{b.postcode ? `, ${b.postcode}` : ""} · <a className="underline" rel="nofollow noopener" href={`/go/biz/${b.id}/directions`}>Directions</a></dd></div>}
              {b.phone && <div><dt className="font-bold">Phone</dt><dd><PhoneLink id={b.id} phone={b.phone} /></dd></div>}
              {(b.instagram || b.facebook || b.linkedin) && <div><dt className="font-bold">Social</dt><dd className="flex flex-wrap gap-x-3">{([["Instagram", b.instagram], ["Facebook", b.facebook], ["LinkedIn", b.linkedin]] as const).filter(([, u]) => u).map(([n, u]) => <a key={n} className="underline" rel="nofollow noopener" href={u!}>{n}</a>)}</dd></div>}
              {b.website && <div><dt className="font-bold">Website</dt><dd><a className="underline" rel="nofollow noopener" href={`/go/biz/${b.id}/website`}>{b.website.replace(/^https?:\/\//, "")}</a></dd></div>}
              </dl>
            {!b.address && !b.phone && !b.website && <p className="text-sm text-grey">Contact details have not been added yet.</p>}
          </div>
          {ent.premium && !b.isSample && (
            <div data-premium="enquiry" className="rounded-2xl border-2 border-ink p-6"><h2 className="mb-3 font-display text-lg font-extrabold">Send an enquiry</h2><LeadForm businessId={b.id} businessName={b.name} formToken={formToken()} /></div>
          )}
          {Object.keys(hours).length > 0 && (
            <div className="rounded-2xl border border-line p-6">
              <h2 className="mb-3 font-display text-lg font-extrabold">Opening hours</h2>
              <dl className="space-y-1 text-sm">{DAYS.map((d) => <div key={d} className="flex justify-between"><dt className="font-bold">{dayName[d]}</dt><dd>{hours[d] ?? "Closed"}</dd></div>)}</dl>
              {b.isSample && <p className="mt-3 text-xs text-grey">Sample hours.</p>}
            </div>
          )}
          {claimed && <p className="text-xs text-grey">{b.ownerUpdatedAt ? `Profile updated by the business on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(b.ownerUpdatedAt)}. ` : ""}<Link className="underline" href={`/claim/dispute?business=${b.slug}`}>Not the owner? Dispute this claim</Link></p>}
          {b.episodes.length > 0 && <div className="rounded-2xl bg-ink p-6 text-white"><p className="text-xs font-bold uppercase text-yellow">Podcast</p>{b.episodes.map((e) => <Link key={e.id} href={`/podcast/${e.slug}`} className="mt-1 block font-bold underline">{e.title}</Link>)}</div>}
        </aside>
      </Container>

      <Container className="mb-10"><nav aria-label="Browse more" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold">
        <Link className="underline decoration-yellow decoration-4 underline-offset-4" href={`/locations/${b.location.slug}/${b.category.slug}`}>More {b.category.name.toLowerCase()} in {b.location.name}</Link>
        <Link className="underline decoration-yellow decoration-4 underline-offset-4" href={`/locations/${b.location.slug}`}>All businesses in {b.location.name}</Link>
        <Link className="underline decoration-yellow decoration-4 underline-offset-4" href={`/businesses/${b.city.slug}/${b.category.slug}`}>All {b.category.name.toLowerCase()} in {b.city.name}</Link>
      </nav></Container>
      {related.length > 0 && <Container><SectionHead title="Similar businesses" /><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{related.map((r) => <BusinessCard key={r.id} b={r} />)}</div></Container>}
    </>
  );
}
