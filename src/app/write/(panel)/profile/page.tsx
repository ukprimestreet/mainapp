import Link from "next/link";
import { DashShell, Notice, Progress, btn } from "@/components/Dash";
import { requireAuthor } from "@/lib/author-auth";
import { MIN_TO_SUBMIT, completeness } from "@/lib/author-profile";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await requireAuthor();
  const c = completeness(me);
  return (
    <DashShell
      title="Your profile"
      subtitle="This is what readers see on your byline and your public page. Phone number and CV are never published."
      actions={<Link href={`/authors/${me.slug}`} className={btn("ghost")}>View public profile</Link>}
    >
      <div className="mb-8 rounded-2xl border-2 border-ink bg-white p-5">
        <Progress percent={c.percent} target={MIN_TO_SUBMIT} label="Profile complete" />
        <p className="mt-3 text-sm text-grey">
          {c.enough
            ? "Complete enough to send work for review."
            : `${MIN_TO_SUBMIT}% unlocks filing for review. Still needed: ${c.missing.map((m) => m.label.toLowerCase()).join(", ")}.`}
        </p>
      </div>

      {!c.termsAccepted && (
        <Notice tone="warn" title="Author terms">
          You also need to accept the author terms before filing. <Link href="/write/terms" className="font-bold underline">Read and accept them →</Link>
        </Notice>
      )}

      <ProfileForm me={JSON.parse(JSON.stringify(me))} checks={c.checks} />
    </DashShell>
  );
}
