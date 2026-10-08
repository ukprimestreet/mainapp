import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/Brand";
import { DashNav } from "@/components/Dash";
import { requireOwner } from "@/lib/owner";
import { db } from "@/lib/db";
import { logoutEverywhere, logoutOwner } from "../actions";

export const metadata: Metadata = { title: "Owner dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  const leads = await db.lead.count({ where: { business: { owners: { some: { ownerId: owner.id } } }, status: "NEW" } });

  return (
    <div className="min-h-screen bg-mist">
      <DashNav
        active="/owner"
        brand={<Link href="/" aria-label="PrimeStreet home"><Wordmark variant="on-black" className="text-xl" /></Link>}
        items={[
          { href: "/owner", label: "My businesses" },
          ...(leads ? [{ href: "/owner", label: "Enquiries", badge: leads }] : []),
        ]}
        right={
          <div className="flex items-center gap-3">
            <span className="max-sm:hidden text-white/60">{owner.email}</span>
            <form action={logoutOwner}><button className="font-bold text-white/70 hover:text-yellow">Sign out</button></form>
            <form action={logoutEverywhere}>
              <button className="max-sm:hidden font-bold text-white/50 hover:text-yellow" title="Ends every signed-in session on every device">Everywhere</button>
            </form>
          </div>
        }
      />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
