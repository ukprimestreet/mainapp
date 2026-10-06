import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";
import { Container } from "@/components/ui";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <div className="border-b border-line bg-mist">
        <Container className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-sm font-bold">
          <span className="font-display text-base font-extrabold">Admin</span>
          {[["Dashboard", "/admin"], ["Articles", "/admin/articles"], ["Reviews", "/admin/reviews"], ["Claims", "/admin/claims"], ["Owner inbox", "/admin/owner-inbox"], ["Podcast", "/admin/podcast"], ["Search", "/admin/search"], ["Newsletter", "/admin/newsletter"], ["Commerce", "/admin/commerce"], ["SEO", "/admin/seo"], ["Submissions", "/admin/submissions"], ["Businesses", "/admin/businesses"], ["Import", "/admin/import"]].map(([n, h]) => <Link key={h} href={h} className="hover:underline">{n}</Link>)}
          <form action={logout} className="ml-auto"><button className="underline">Sign out</button></form>
        </Container>
      </div>
      <Container className="py-8">{children}</Container>
    </>
  );
}
