import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { sha256 } from "@/lib/antispam";
import { db } from "@/lib/db";
import { ManagePanel } from "./ManagePanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage your review", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Manage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await db.review.findFirst({ where: { tokenHash: sha256(token) }, include: { business: true } });
  return (
    <>
      <PageHeader kicker="Your review" title={r ? `Your review of ${r.business.name}` : "Link not valid"} />
      <Container className="max-w-2xl py-10">
        {r ? <ManagePanel token={token} review={{ rating: r.rating, title: r.title ?? "", body: r.body, authorName: r.authorName, status: r.status, statusLabel: r.status }} />
          : <p className="rounded-xl border-2 border-dashed border-line p-6">This link is no longer valid. If you deleted your review, it has been removed. Otherwise, submit the review form again to get a new link.</p>}
      </Container>
    </>
  );
}
