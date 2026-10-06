import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { sha256 } from "@/lib/antispam";
import { db } from "@/lib/db";
import { StatusPanel } from "./StatusPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your claim", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ClaimStatus({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await db.claimRequest.findFirst({ where: { tokenHash: sha256(token) }, include: { business: true } });
  return (
    <>
      <PageHeader kicker={c?.kind === "DISPUTE" ? "Ownership report" : "Your claim"} title={c ? c.business.name : "Link not valid"} />
      <Container className="max-w-2xl py-10">
        {c ? (
          <StatusPanel token={token} claim={{ kind: c.kind, status: c.status, emailVerified: !!c.emailVerifiedAt, phoneVerified: !!c.phoneVerifiedAt, phoneCodeIssued: !!c.phoneCodeHash, domainMatch: c.domainMatch, adminNotes: c.status === "NEEDS_INFO" ? c.adminNotes ?? "" : "", email: c.email }} />
        ) : (
          <p className="rounded-xl border-2 border-dashed border-line p-6">This link is no longer valid. If you submitted a claim again, use the newest email we sent you.</p>
        )}
      </Container>
    </>
  );
}
