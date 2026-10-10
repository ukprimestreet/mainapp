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
  const active = (await headers()).get("x-ps-path") ?? "/owner";

  const links = await db.businessOwner.findMany({
    where: { ownerId: owner.id },
    include: { business: { select: { id: true, name: true } } },
    orderBy: { grantedAt: "asc" },
  });

  // Which business is in view: the one in the path, else the first. With several listings the nav shows one
  // business at a time plus a switcher, rather than repeating every link for every business.
  const inPath = active.match(/^\/owner\/business\/([^/]+)/)?.[1];
  const current = links.find((l) => l.businessId === inPath) ?? links[0];

  const [leads, unanswered] = current
    ? await Promise.all([
        db.lead.count({ where: { businessId: current.businessId, status: "NEW" } }),
        db.review.count({ where: { businessId: current.businessId, status: "PUBLISHED", response: null } }),
      ])
    : [0, 0];

  const b = current?.businessId;
  const groups: NavGroup[] = [
    { title: "Overview", items: [{ href: "/owner", label: "All my businesses", icon: "home", exact: true }] },
    ...(b
      ? [
          {
            title: current!.business.name,
            items: [
              { href: `/owner/business/${b}/insights`, label: "Insights", icon: "chart" as const },
              { href: `/owner/business/${b}/leads`, label: "Enquiries", icon: "inbox" as const, badge: leads || undefined },
              { href: `/owner/business/${b}/reviews`, label: "Reviews", icon: "star" as const, badge: unanswered || undefined },
            ],
          },
          {
            title: "Your profile",
            items: [
              { href: `/owner/business/${b}`, label: "Edit details", icon: "shop" as const, exact: true },
              { href: `/owner/business/${b}/photos`, label: "Photos", icon: "file" as const },
              { href: `/owner/business/${b}/hours`, label: "Opening hours", icon: "map" as const },
              { href: `/owner/business/${b}/offers`, label: "Offers", icon: "tag" as const },
              { href: `/owner/business/${b}/team`, label: "Who can manage", icon: "users" as const },
            ],
          },
          {
            title: "Growing",
            items: [
              { href: `/owner/business/${b}/promote`, label: "Promote", icon: "bolt" as const },
              { href: `/owner/business/${b}/billing`, label: "Billing", icon: "card" as const },
              { href: `/owner/business/${b}/coverage`, label: "Tell us your story", icon: "pen" as const },
            ],
          },
        ]
      : []),
    { title: "Support", items: [{ href: "/owner/help", label: "Help", icon: "shield" }] },
  ];

  return (
    <DashLayout
      title="Your business"
      active={active}
      groups={groups}
      account={
        <AccountBlock name={owner.name} sub={owner.email}>
          <Link href="/" className="hover:text-yellow">View site</Link>
          <form action={logoutOwner}><button className="hover:text-yellow">Sign out</button></form>
          <form action={logoutEverywhere}>
            <button className="hover:text-yellow" title="Ends every signed-in session on every device">Everywhere</button>
          </form>
        </AccountBlock>
      }
    >
      {links.length > 1 && current && (
        <nav aria-label="Choose a business" className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-grey">Managing:</span>
          {links.map((l) => {
            const on = l.businessId === current.businessId;
            return (
              <Link
                key={l.businessId}
                href={`/owner/business/${l.businessId}/insights`}
                aria-current={on ? "page" : undefined}
                className={`rounded-xl border-2 px-3.5 py-1.5 text-sm font-bold transition ${on ? "border-ink bg-yellow" : "border-line bg-white hover:border-ink"}`}
              >
                {l.business.name}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </DashLayout>
  );
}
