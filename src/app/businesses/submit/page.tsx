import { Container, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { meta } from "@/lib/seo";
import { SubmitForm } from "./SubmitForm";

export const dynamic = "force-dynamic";
export const metadata = meta({ title: "Suggest a business", description: "Know a London business that belongs on PrimeStreet? Suggest it. Every suggestion is reviewed by a person.", path: "/businesses/submit" });

export default async function SubmitPage() {
  const [categories, areas] = await Promise.all([db.category.findMany({ orderBy: { name: "asc" } }), db.location.findMany({ orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader ld kicker="Directory" title="Suggest a business" intro="Own one or love one? Tell us about it. We review every suggestion before it goes live as an unclaimed profile." crumbs={[{ name: "Home", href: "/" }, { name: "Businesses", href: "/businesses" }, { name: "Suggest" }]} />
      <Container className="max-w-2xl py-10"><SubmitForm categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} areas={areas.map((c) => ({ slug: c.slug, name: c.name }))} /></Container>
    </>
  );
}
