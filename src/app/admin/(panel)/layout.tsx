import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/Brand";
import { DashNav } from "@/components/Dash";
import { requireAdmin } from "@/lib/auth";
import { queueCount } from "@/lib/editorial-flow";
import { db } from "@/lib/db";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [review, reviews, claims, inbox] = await Promise.all([
    queueCount(),
    db.review.count({ where: { status: "PENDING" } }),
    db.claimRequest.count({ where: { status: { in: ["PENDING", "NEEDS_INFO"] } } }),
    db.profileChangeRequest.count({ where: { status: "OPEN" } }),
  ]);

  const items = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/compose", label: "Write" },
    { href: "/admin/review", label: "Review", badge: review || undefined },
    { href: "/admin/articles", label: "Articles" },
    { href: "/admin/authors", label: "Writers" },
    { href: "/admin/businesses", label: "Businesses" },
    { href: "/admin/reviews", label: "Ratings", badge: reviews || undefined },
    { href: "/admin/claims", label: "Claims", badge: claims || undefined },
    { href: "/admin/owner-inbox", label: "Inbox", badge: inbox || undefined },
    { href: "/admin/commerce", label: "Commerce" },
    { href: "/admin/podcast", label: "Podcast" },
    { href: "/admin/cities", label: "Cities" },
    { href: "/admin/search", label: "Search" },
    { href: "/admin/newsletter", label: "Newsletter" },
    { href: "/admin/seo", label: "SEO" },
    { href: "/admin/submissions", label: "Submissions" },
    { href: "/admin/outbox", label: "Email" },
    { href: "/admin/import", label: "Import" },
  ];

  return (
    <div className="min-h-screen bg-mist">
      <DashNav
        active="/admin"
        brand={<Link href="/" aria-label="PrimeStreet home" className="flex items-center gap-2"><Wordmark variant="on-black" className="text-xl" /></Link>}
        items={items}
        right={<form action={logout}><button className="font-bold text-white/70 hover:text-yellow">Sign out</button></form>}
      />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
