import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { meta } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = meta({ title: "Business categories", description: "Browse London businesses by category.", path: "/categories" });

export default async function CategoriesPage() {
  const cats = await db.category.findMany({ include: { _count: { select: { businesses: true } } }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader kicker="Explore" title="Categories" intro="From cleaners to coffee roasters — find London businesses by what they do." crumbs={[{ name: "Home", href: "/" }, { name: "Categories" }]} />
      <Container className="py-10">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c) => (
            <li key={c.id}><Link href={`/categories/${c.slug}`} className="block h-full rounded-2xl border border-line p-5 hover:border-ink hover:bg-yellow">
              <span className="font-display text-xl font-extrabold">{c.name}</span>
              <span className="mt-1 block text-sm text-grey">{c.intro}</span>
              <span className="mt-3 block text-sm font-bold">{c._count.businesses} {c._count.businesses === 1 ? "business" : "businesses"}</span></Link></li>
          ))}
        </ul>
      </Container>
    </>
  );
}
