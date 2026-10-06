import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { requireOwner } from "@/lib/owner";
import { logoutEverywhere, logoutOwner } from "../actions";

export const metadata: Metadata = { title: "Owner dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  return (
    <>
      <div className="border-b border-line bg-mist">
        <Container className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-sm font-bold">
          <Link href="/owner" className="font-display text-base font-extrabold">Owner dashboard</Link>
          <span className="font-normal text-grey">{owner.email}</span>
          <form action={logoutOwner} className="ml-auto"><button className="underline">Sign out</button></form>
          <form action={logoutEverywhere}><button className="underline" title="Ends every signed-in session on every device">Sign out everywhere</button></form>
        </Container>
      </div>
      <Container className="py-8">{children}</Container>
    </>
  );
}
