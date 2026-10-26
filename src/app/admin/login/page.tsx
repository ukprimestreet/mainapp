import type { Metadata } from "next";
import { Wordmark } from "@/components/Brand";
import { legacyLoginAllowed } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Login({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const { set } = await searchParams;
  const legacy = await legacyLoginAllowed();
  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <Wordmark className="text-4xl" />
      <h1 className="mt-6 text-2xl font-extrabold">Admin sign in</h1>
      {set === "1" && (
        <p className="mt-5 rounded-xl border-2 border-ink bg-yellow-soft p-3 text-sm font-bold">
          Password set. Sign in with it below.
        </p>
      )}
      <LoginForm legacy={legacy} />
    </div>
  );
}
