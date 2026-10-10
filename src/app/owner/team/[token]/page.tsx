import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { inviteState } from "@/lib/team-invite";
import { SUPPORT_EMAIL } from "@/lib/mail";
import { Accept } from "./Accept";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage a business", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AcceptInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state, invite } = await inviteState(token);

  return (
    <>
      <PageHeader kicker="For business owners" title="You've been asked to help manage a listing" />
      <Container className="max-w-xl py-10">
        {state === "ok" && invite ? (
          <div className="rounded-2xl border-2 border-ink bg-white p-7">
            <p className="text-[17px]">
              <strong>{invite.invitedBy}</strong> has asked you to help manage{" "}
              <strong>{invite.business.name}</strong> on PrimeStreet.
            </p>
            <p className="mt-4 text-[15px] text-grey">
              Accepting creates your account at <strong>{invite.email}</strong> and signs you in. You'll be able to edit the
              profile, reply to reviews, see enquiries from customers and view the billing page — everyone who manages a
              listing has the same access, so only accept if that is what they intended. Accepting never charges you
              anything.
            </p>
            <div className="mt-6">
              <Accept token={token} business={invite.business.name} />
            </div>
            <p className="mt-5 text-[13px] text-grey">
              Not expecting this? Ignore it and nothing happens — the invitation expires on its own. If it looks like someone
              is trying to get at a business that isn't theirs, tell us at <strong>{SUPPORT_EMAIL()}</strong>.
            </p>
          </div>
        ) : (
          <div role="alert" className="rounded-2xl border-2 border-red-700 bg-white p-7">
            <p className="font-bold">
              {state === "used"
                ? "This invitation has already been used."
                : state === "expired"
                  ? "This invitation has expired."
                  : "This invitation isn't valid."}
            </p>
            <p className="mt-3 text-[15px] text-grey">
              {state === "used"
                ? "If that was you, just sign in. If it wasn't, ask whoever invited you to send a new one."
                : "Invitations last seven days. Ask whoever invited you to send another."}
            </p>
            <p className="mt-4">
              <Link href="/owner/login" className="font-bold underline">Sign in to PrimeStreet</Link>
            </p>
          </div>
        )}
      </Container>
    </>
  );
}
