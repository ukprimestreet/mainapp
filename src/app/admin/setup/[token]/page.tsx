import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Brand";
import { setupTokenState } from "@/lib/admin-users";
import { MIN_PASSWORD } from "@/lib/author-password";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set your admin password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Setup({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Read-only: looking at this page must never spend the link.
  const { state, admin } = await setupTokenState(token);

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <Wordmark className="text-4xl" />
      {state === "ok" && admin ? (
        <>
          <h1 className="mt-6 text-2xl font-extrabold">Set your password</h1>
          <p className="mt-2 text-[15px] text-grey">
            For <strong>{admin.email}</strong>, as <strong>{admin.role === "SUPER_ADMIN" ? "super admin" : "admin"}</strong>.
            At least {MIN_PASSWORD} characters, and not something you use anywhere else.
          </p>
          <SetupForm token={token} />
        </>
      ) : (
        <div role="alert" className="mt-6 rounded-2xl border-2 border-red-700 p-6">
          <p className="font-bold">
            {state === "expired" ? "That link has expired." : "That link is not valid."}
          </p>
          <p className="mt-2 text-[15px] text-grey">
            Setup links work once and last 48 hours. Ask a super admin to send a new one.
          </p>
          <p className="mt-4"><Link href="/admin/login" className="font-bold underline">Back to sign in</Link></p>
        </div>
      )}
    </div>
  );
}
