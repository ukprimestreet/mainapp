import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { formToken } from "@/lib/antispam";
import { db } from "@/lib/db";
import { MAX_RECIPIENTS } from "@/lib/leads";
import { meta } from "@/lib/seo";
import { QuoteForm, type Borough, type Option } from "./QuoteForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = meta({
  title: "Get quotes from local businesses",
  description: "Tell us what you need doing and where. We pass it to a maximum of two local businesses who cover your area — no auction, no twelve phone calls.",
  path: "/get-quotes",
});

/** The boroughs we currently cover. East London, per decision D6 — the same list the register form uses. */
const EAST_LONDON = ["Tower Hamlets", "Hackney", "Newham", "Waltham Forest", "Redbridge", "Barking and Dagenham", "Havering"];

export default async function GetQuotes() {
  const [categories, boroughPlaces] = await Promise.all([
    db.category.findMany({ where: { parentId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.place.findMany({
      where: { kind: { in: ["LAD", "UNITARY"] }, name: { in: EAST_LONDON } },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true,
        children: {
          where: { kind: { in: ["TOWN", "SUBURB", "LOCALITY"] }, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  const boroughs: Borough[] = boroughPlaces.map((b) => ({ id: b.id, name: b.name, localities: b.children }));

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
