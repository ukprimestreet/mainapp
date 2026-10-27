import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { formToken } from "@/lib/antispam";
import { coverageOptions } from "@/lib/coverage";
import { db } from "@/lib/db";
import { meta } from "@/lib/seo";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = meta({
  title: "List your business on PrimeStreet",
  description: "Register your business free on PrimeStreet, the London business directory. Five lead credits included so customer enquiries can reach you.",
  path: "/register",
});

export default async function Register() {
  const [categories, boroughs] = await Promise.all([
    db.category.findMany({ where: { parentId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // One list, shared with /get-quotes and the owner's own coverage page, so the three cannot drift.
    coverageOptions(),
  ]);

  return (
    <>
      <PageHeader
        ld
        crumbs={[{ name: "Home", href: "/" }, { name: "List your business" }]}
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
