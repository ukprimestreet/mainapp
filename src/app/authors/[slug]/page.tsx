import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/Cards";
import { Container, EmptyState, JsonLd, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { abs, breadcrumbLd, meta } from "@/lib/seo";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };
const load = async (slug: string) => {
  const author = await db.author.findUnique({ where: { slug } });
  if (!author) return null;
  const articles = await db.article.findMany({ where: { authorId: author.id, status: "PUBLISHED", publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" }, take: 30, include: { author: true, location: true } });
  return { author, articles };
};

export async function generateMetadata({ params }: P) {
  const d = await load((await params).slug);
  if (!d) return {};
  return meta({ title: d.author.name, description: `${d.author.bio ? d.author.bio + " " : ""}Read articles by ${d.author.name} on PrimeStreet, London's business media and local directory.`.slice(0, 160), path: `/authors/${d.author.slug}`, noindex: d.articles.length === 0 || d.articles.every((a) => a.isSample) });
}

export default async function AuthorPage({ params }: P) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const { author, articles } = d;
  return (
    <>
      <JsonLd data={[breadcrumbLd([{ name: "Home", path: "/" }, { name: author.name, path: `/authors/${author.slug}` }]), { "@context": "https://schema.org", "@type": "Person", name: author.name, url: abs(`/authors/${author.slug}`), ...(author.role ? { jobTitle: author.role } : {}), worksFor: { "@type": "Organization", name: "PrimeStreet" } }]} />
      <PageHeader kicker={author.role ?? "Author"} title={author.name} intro={author.bio ?? undefined} crumbs={[{ name: "Home", href: "/" }, { name: author.name }]} />
      <Container className="py-12">
        {articles.length === 0 ? <EmptyState title="Nothing published yet" /> : <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{articles.map((a) => <ArticleCard key={a.id} a={a} level={2} />)}</div>}
      </Container>
    </>
  );
}
