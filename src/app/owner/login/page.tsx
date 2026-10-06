import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { getOwner } from "@/lib/owner";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Owner sign in", robots: { index: false, follow: false } };

export default async function OwnerLogin() {
  if (await getOwner()) redirect("/owner");
  return (
    <>
      <PageHeader kicker="For business owners" title="Sign in" intro="No password to remember: we email you a one-time sign-in link. You need an approved claim first." />
      <Container className="max-w-md py-10"><LoginForm /></Container>
    </>
  );
}
