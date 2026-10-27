import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check your email — PrimeStreet", robots: { index: false, follow: false } };

export default async function Sent({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <>
      <PageHeader kicker="Almost there" title="Check your email" />
      <Container className="max-w-xl py-10">
        <div className="rounded-2xl border-2 border-ink p-6">
          <p className="text-[17px]">
            We have sent a link to {email ? <strong>{email}</strong> : "the address you gave"}. Open it to
            confirm the address is yours.
          </p>
          <p className="mt-4 text-[15px] text-grey">
            Nothing is live yet. After you confirm, a person checks the listing — usually within a working
            day — and then it goes live with your five lead credits.
          </p>
          <p className="mt-4 text-[15px] text-grey">
            Nothing arrived? Check spam, then email <strong>{SUPPORT_EMAIL()}</strong> and a person will sort it.
          </p>
          <p className="mt-5"><Link href="/" className="font-bold underline">Back to PrimeStreet</Link></p>
        </div>
      </Container>
    </>
  );
}
