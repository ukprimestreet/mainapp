import { Container, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { meta } from "@/lib/seo";
import { ClaimForm } from "./ClaimForm";

export const dynamic = "force-dynamic";
export const metadata = meta({ title: "Claim your business", description: "Own a business listed on PrimeStreet? Claim your profile to keep details accurate, add photos and respond to reviews.", path: "/claim" });

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { business = "" } = await searchParams;
  const list = await db.business.findMany({ where: { claimStatus: { in: ["UNCLAIMED", "PENDING"] }, published: true }, include: { location: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader ld kicker="For business owners" title="Own this business? Claim your profile." intro="It's free. Tell us who you are, we verify, and you get control of how your business appears on PrimeStreet." crumbs={[{ name: "Home", href: "/" }, { name: "Claim" }]} />
      <Container className="grid gap-12 py-10 lg:grid-cols-[1fr_320px]">
        <ClaimForm options={list.map((b) => ({ slug: b.slug, name: b.name, area: b.location.name }))} preselected={business} />
        <aside className="space-y-4 text-sm">
          <h2 className="font-display text-xl font-extrabold">How it works</h2>
          <ol className="list-decimal space-y-2 pl-5"><li>Submit the form.</li><li>We check your details — we may ask for more.</li><li>Once approved, your profile shows as Verified and you can manage it.</li></ol>
          <p className="text-grey">Can&apos;t find your business? <a href="/businesses/submit" className="font-bold underline">Suggest it here</a>.</p>
        </aside>
      </Container>
    </>
  );
}
