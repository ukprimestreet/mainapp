import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { formToken } from "@/lib/antispam";
import { db } from "@/lib/db";
import { meta } from "@/lib/seo";
import { RegisterForm, type Borough } from "./RegisterForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = meta({
  title: "List your business on PrimeStreet",
  description: "Register your business free on PrimeStreet, the London business directory. Five lead credits included so customer enquiries can reach you.",
  path: "/register",
});

/** The boroughs we currently cover. East London, per decision D6. */
const EAST_LONDON = ["Tower Hamlets", "Hackney", "Newham", "Waltham Forest", "Redbridge", "Barking and Dagenham", "Havering"];

export default async function Register() {
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
        kicker="For business owners"
        title="List your business"
        intro="Free, and it stays free. Five lead credits included so customer enquiries can reach you from the start."
      />
      <Container className="max-w-3xl py-10">
        <RegisterForm categories={categories} boroughs={boroughs} formToken={formToken()} />
      </Container>
    </>
  );
}
