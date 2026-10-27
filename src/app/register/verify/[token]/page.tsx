import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/mail";
import { verifyRegistrationEmail } from "@/lib/registration";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email confirmed — PrimeStreet", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Verify({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await verifyRegistrationEmail(token);

  return (
    <>
      <PageHeader kicker="Registration" title={result.state === "invalid" ? "That link is not valid" : "Email confirmed"} />
      <Container className="max-w-xl py-10">
        {result.state === "invalid" ? (
          <div role="alert" className="rounded-2xl border-2 border-red-700 p-6">
            <p className="font-bold">We could not match that link to a registration.</p>
            <p className="mt-2 text-[15px] text-grey">
              It may have been mistyped, or the registration may have been removed. Email{" "}
              <strong>{SUPPORT_EMAIL()}</strong> and a person will help, or{" "}
              <Link href="/register" className="font-bold underline">register again</Link>.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-ink p-6">
            <p className="text-[17px]">
              {result.state === "already" ? "That was already confirmed — nothing more to do." : "Thank you."}{" "}
              {result.name ? <>We have everything we need for <strong>{result.name}</strong>.</> : null}
            </p>
            <p className="mt-4 text-[15px] text-grey">
              A person now checks the listing, usually within a working day. We check because a directory
              nobody checks is not worth reading.
            </p>
            <p className="mt-3 text-[15px] text-grey">
              When it goes live you will get an email with a link to your dashboard, and five lead credits so
              customer enquiries can reach you.
            </p>
            <p className="mt-5"><Link href="/" className="font-bold underline">Back to PrimeStreet</Link></p>
          </div>
        )}
      </Container>
    </>
  );
}
