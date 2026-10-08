import Link from "next/link";
import { Wordmark } from "@/components/Brand";
import { tokenState } from "@/lib/author-auth";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/antispam";
import { meta } from "@/lib/seo";
import { SetPasswordForm } from "../../SetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { ...meta({ title: "Choose a new password", description: "Reset your PrimeStreet writer password.", path: "/write/reset", noindex: true }) };

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await tokenState(token, "RESET");
  const row = state === "ok" ? await db.authorLoginToken.findUnique({ where: { tokenHash: sha256(token) }, include: { author: true } }) : null;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-12 text-white">
      <Link href="/" aria-label="PrimeStreet home" className="mb-8"><Wordmark variant="on-black" className="text-3xl" /></Link>
      <div className="w-full max-w-md rounded-3xl bg-white p-7 text-ink sm:p-9">
        {state === "ok" && row ? (
          <>
            <h1 className="font-display text-2xl font-extrabold">Choose a new password</h1>
            <p className="mt-1 text-sm text-grey">This also signs you out on any other device.</p>
            <SetPasswordForm token={token} email={row.author.email ?? ""} purpose="RESET" />
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-extrabold">This link no longer works</h1>
            <p className="mt-2 text-grey">Reset links last an hour and work once. Request another from the sign-in page.</p>
            <Link href="/write/login" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-bold text-yellow">Go to sign in</Link>
          </>
        )}
      </div>
    </main>
  );
}
