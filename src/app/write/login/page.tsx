import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/Brand";
import { getAuthorSession } from "@/lib/author-auth";
import { meta } from "@/lib/seo";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";
export const metadata = { ...meta({ title: "Writer sign in", description: "Sign in to the PrimeStreet writers' desk.", path: "/write/login", noindex: true }) };

export default async function WriterLogin({ searchParams }: { searchParams: Promise<{ set?: string; next?: string }> }) {
  if (await getAuthorSession()) redirect("/write");
  const { set } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-12 text-white">
      <Link href="/" aria-label="PrimeStreet home" className="mb-8"><Wordmark variant="on-black" className="text-3xl" /></Link>
      <div className="w-full max-w-md rounded-3xl bg-white p-7 text-ink sm:p-9">
        <h1 className="font-display text-2xl font-extrabold">Writers&apos; desk</h1>
        <p className="mt-1 text-sm text-grey">Sign in with the email address an editor registered for you.</p>
        {set === "1" && (
          <p className="mt-5 rounded-xl border-2 border-ink bg-yellow-soft p-3 text-sm font-bold">
            Password set. Sign in below — we have also emailed you what to expect and a link to the author terms.
          </p>
        )}
        {set === "2" && <p className="mt-5 rounded-xl border-2 border-ink bg-yellow-soft p-3 text-sm font-bold">Password changed. Sign in with your new password.</p>}
        <SignInForm />
        <p className="mt-6 text-sm text-grey">
          Don&apos;t have an account? Accounts are created by a PrimeStreet editor — <Link href="/about" className="font-bold text-ink underline">get in touch</Link> if you would like to write for us.
        </p>
      </div>
    </div>
  );
}
