import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { DisputeForm } from "./DisputeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dispute a claim", robots: { index: false, follow: true } };

export default async function DisputePage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { business = "" } = await searchParams;
  const b = await db.business.findFirst({ where: { slug: business, published: true, claimStatus: { in: ["CLAIMED", "VERIFIED"] } } });
  return (
    <>
      <PageHeader kicker="Ownership" title={b ? `Dispute the claim on ${b.name}` : "Dispute a claim"} intro="If someone who isn't connected to this business controls its profile, tell us. We review every report and nothing changes until we've checked." />
      <Container className="max-w-2xl py-10">{b ? <DisputeForm slug={b.slug} /> : <p className="rounded-xl border-2 border-dashed border-line p-6">Open this page from a claimed business profile.</p>}</Container>
    </>
  );
}
