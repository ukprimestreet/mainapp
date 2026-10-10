import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { AccountBlock, DashLayout, type NavGroup } from "@/components/Dash";
import { requireAdmin } from "@/lib/auth";
import { queueCount } from "@/lib/editorial-flow";
import { db } from "@/lib/db";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [review, ratings, claims, inbox, subs, enquiries] = await Promise.all([
    queueCount(),
    db.review.count({ where: { status: "PENDING" } }),
    db.claimRequest.count({ where: { status: { in: ["PENDING", "NEEDS_INFO"] } } }),
    db.profileChangeRequest.count({ where: { status: "OPEN" } }),
    db.businessSubmission.count({ where: { status: "PENDING" } }),
    db.salesEnquiry.count({ where: { status: "NEW" } }),
  ]);

  const groups: NavGroup[] = [
    { title: "Overview", items: [{ href: "/admin", label: "Dashboard", icon: "home", exact: true }] },
    { title: "Editorial", items: [
      { href: "/admin/compose", label: "Write", icon: "pen" },
      { href: "/admin/review", label: "Review queue", icon: "check", badge: review },
      { href: "/admin/articles", label: "Articles", icon: "file" },
      { href: "/admin/authors", label: "Writers", icon: "users" },
      { href: "/admin/podcast", label: "Podcast", icon: "mic" },
    ] },
    { title: "Directory", items: [
      { href: "/admin/businesses", label: "Businesses", icon: "shop" },
      { href: "/admin/reviews", label: "Ratings", icon: "star", badge: ratings },
      { href: "/admin/claims", label: "Claims", icon: "shield", badge: claims },
      { href: "/admin/submissions", label: "Submissions", icon: "inbox", badge: subs },
      { href: "/admin/cities", label: "Cities", icon: "map" },
      { href: "/admin/import", label: "Import", icon: "upload" },
    ] },
    { title: "Revenue", items: [
      { href: "/admin/commerce", label: "Commerce", icon: "card", badge: enquiries },
      { href: "/admin/owner-inbox", label: "Owner inbox", icon: "inbox", badge: inbox },
    ] },
    { title: "Reach", items: [
      { href: "/admin/search", label: "Search", icon: "search" },
      { href: "/admin/newsletter", label: "Newsletter", icon: "mail" },
      { href: "/admin/outbox", label: "Email", icon: "mail" },
      { href: "/admin/seo", label: "SEO", icon: "chart" },
    ] },
  ];

  await requireAdmin();
  const active = (await headers()).get("x-ps-path") ?? "/admin";

  return (
    <DashLayout
      title="Admin"
      active={active}
      groups={groups}
      account={
        <AccountBlock name="Signed in as admin" sub={process.env.ADMIN_EMAIL ?? undefined}>
          <Link href="/" className="hover:text-yellow">View site</Link>
          <form action={logout}><button className="hover:text-yellow">Sign out</button></form>
        </AccountBlock>
      }
    >
      {children}
    </DashLayout>
  );
}
