import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { formToken } from "@/lib/antispam";
import { coverageOptions } from "@/lib/coverage";
import { db } from "@/lib/db";
import { MAX_RECIPIENTS } from "@/lib/leads";
import { meta } from "@/lib/seo";
import { QuoteForm, type Option } from "./QuoteForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = meta({
  title: "Get quotes from local businesses",
  description: "Tell us what you need doing and where. We pass it to a maximum of two local businesses who cover your area — no auction, no twelve phone calls.",
  path: "/get-quotes",
});

export default async function GetQuotes() {
  const [categories, boroughs] = await Promise.all([
    db.category.findMany({ where: { parentId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    coverageOptions(),
  ]);

  return (
    <>
      <PageHeader
        kicker="Tell us what you need"
        title="Get quotes from local businesses"
        intro={`One form, and it goes to a maximum of ${MAX_RECIPIENTS} businesses who actually cover your area. Not twelve, and never sold on.`}
      />
      <Container className="max-w-3xl py-10">
        <QuoteForm categories={categories as Option[]} boroughs={boroughs} formToken={formToken()} />
      </Container>
    </>
  );
}
