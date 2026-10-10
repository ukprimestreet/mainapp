import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { AccountBlock, DashLayout, type NavGroup } from "@/components/Dash";
import { requireOwner } from "@/lib/owner";
import { db } from "@/lib/db";
import { logoutEverywhere, logoutOwner } from "../actions";

export const metadata: Metadata = { title: "Your business — PrimeStreet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  const [links, leads, unanswered] = await Promise.all([
    db.businessOwner.findMany({ where: { ownerId: owner.id }, include: { business: { select: { id: true, name: true } } } }),
    db.lead.count({ where: { business: { owners: { some: { ownerId: owner.id } } }, status: "NEW" } }),
    db.review.count({ where: { business: { owners: { some: { ownerId: owner.id } } }, status: "PUBLISHED", response: null } }),
  ]);

  const groups: NavGroup[] = [
    { title: "Overview", items: [{ href: "/owner", label: "Dashboard", icon: "home", exact: true }] },
    ...(links.length
      ? [{
          title: links.length === 1 ? "Your business" : "Your businesses",
          items: links.flatMap((l) => [
            { href: `/owner/business/${l.business.id}`, label: l.business.name, icon: "shop" as const },
            { href: `/owner/business/${l.business.id}/leads`, label: "Enquiries", icon: "inbox" as const, badge: leads || undefined },
            { href: `/owner/business/${l.business.id}/reviews`, label: "Reviews", icon: "star" as const, badge: unanswered || undefined },
            { href: `/owner/business/${l.business.id}/promote`, label: "Promote", icon: "bolt" as const },
          ]).slice(0, links.length === 1 ? 4 : 12),
        }]
      : []),
  ];

  const active = (await headers()).get("x-ps-path") ?? "/owner";

  return (
    <DashLayout
      title="Your business"
      active={active}
      groups={groups}
      account={
        <AccountBlock name={owner.name} sub={owner.email}>
          <Link href="/" className="hover:text-yellow">View site</Link>
          <form action={logoutOwner}><button className="hover:text-yellow">Sign out</button></form>
          <form action={logoutEverywhere}><button className="hover:text-yellow" title="Ends every signed-in session on every device">Everywhere</button></form>
        </AccountBlock>
      }
    >
      {children}
    </DashLayout>
  );
}
