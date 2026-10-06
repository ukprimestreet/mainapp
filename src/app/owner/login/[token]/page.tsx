import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { loginTokenState } from "@/lib/owner";
import { ConfirmLogin } from "./ConfirmLogin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LoginLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await loginTokenState(token); // read-only: merely viewing this page never uses the link up
  return (
    <>
      <PageHeader kicker="For business owners" title="Sign in to PrimeStreet" />
      <Container className="max-w-md py-10">
        {state === "ok" ? <ConfirmLogin token={token} /> : (
          <div role="alert" className="rounded-xl border-2 border-red-700 p-6"><p className="font-bold">{state === "used" ? "This sign-in link has already been used." : state === "expired" ? "This sign-in link has expired." : "This sign-in link isn't valid."}</p>
            <p className="mt-2"><Link href="/owner/login" className="font-bold underline">Request a new one</Link></p></div>
        )}
      </Container>
    </>
  );
}
