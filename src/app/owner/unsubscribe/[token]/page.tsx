import Link from "next/link";
import { Wordmark } from "@/components/Brand";
import { btn } from "@/components/Dash";
import { db } from "@/lib/db";
import { resubscribeByToken, unsubscribeByToken } from "@/lib/email/consent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email preferences — PrimeStreet", robots: { index: false, follow: false } };

/**
 * One-click unsubscribe, no sign-in. Acting on GET would mean a mail scanner could unsubscribe someone by
 * merely following links, so the GET shows a confirm button and the POST does the work.
 */
export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const owner = await db.owner.findFirst({ where: { unsubToken: token } });

  async function stop() {
    "use server";
    await unsubscribeByToken(token);
    const { redirect } = await import("next/navigation");
    redirect(`/owner/unsubscribe/${token}?done=1`);
  }
  async function resume() {
    "use server";
    await resubscribeByToken(token);
    const { redirect } = await import("next/navigation");
    redirect(`/owner/unsubscribe/${token}?done=2`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-12 text-white">
      <Link href="/" aria-label="PrimeStreet home" className="mb-8"><Wordmark variant="on-black" className="text-3xl" /></Link>
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-ink">
        {!owner ? (
          <>
            <h1 className="font-display text-2xl font-extrabold">That link is not valid</h1>
            <p className="mt-2 text-grey">It may have already been used, or the address may have changed. Email hello@primestreet.uk and we will sort it by hand.</p>
          </>
        ) : done === "1" ? (
          <>
            <h1 className="font-display text-2xl font-extrabold">Done — no more non-essential email</h1>
            <p className="mt-2 text-grey">
              We will still send the things your account needs: sign-in links, claim decisions, customer enquiries and receipts.
              Turning those off would break your account.
            </p>
            <form action={resume} className="mt-6"><button className={btn("ghost")}>Actually, start them again</button></form>
          </>
        ) : done === "2" ? (
          <>
            <h1 className="font-display text-2xl font-extrabold">You are back on</h1>
            <p className="mt-2 text-grey">Monthly reports and occasional prompts about your listing will resume.</p>
            <Link href="/owner" className={`${btn()} mt-6`}>Go to my dashboard</Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-extrabold">Stop non-essential emails?</h1>
            <p className="mt-2 text-grey">
              For <strong className="text-ink">{owner.email}</strong>. This stops monthly reports, prompts about your listing and anything promotional.
            </p>
            <p className="mt-3 text-sm text-grey">
              You will still get what your account needs: sign-in links, claim decisions, customer enquiries and receipts.
            </p>
            <form action={stop} className="mt-6"><button className={btn()}>Yes, stop them</button></form>
            <p className="mt-4 text-sm"><Link href="/owner" className="font-bold underline">Manage everything in my dashboard instead</Link></p>
          </>
        )}
      </div>
    </main>
  );
}
