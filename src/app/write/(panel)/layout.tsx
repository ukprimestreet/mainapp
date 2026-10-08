import Link from "next/link";
import { Wordmark } from "@/components/Brand";
import { DashNav } from "@/components/Dash";
import { Avatar } from "@/components/Social";
import { requireAuthor } from "@/lib/author-auth";
import { completeness } from "@/lib/author-profile";
import { db } from "@/lib/db";
import { authorSignOut } from "../actions";

export const dynamic = "force-dynamic";

export default async function WritePanelLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAuthor();
  const [drafts, changes] = await Promise.all([
    db.article.count({ where: { authorId: me.id, status: { in: ["DRAFT", "SUBMITTED"] } } }),
    db.article.count({ where: { authorId: me.id, status: "DRAFT", reviews: { some: { decision: "CHANGES_REQUESTED" } } } }),
  ]);
  const c = completeness(me);
  const items = [
    { href: "/write", label: "Dashboard" },
    { href: "/write/articles", label: "My work", badge: drafts || undefined },
    { href: "/write/profile", label: "Profile", badge: c.enough && c.termsAccepted ? undefined : 1 },
    { href: "/write/terms", label: "Terms" },
  ] as const;
  return (
    <>
      <DashNav
        active="/write"
        brand={<Link href="/" aria-label="PrimeStreet home"><Wordmark variant="on-black" className="text-xl" /></Link>}
        items={items}
        right={
          <form action={authorSignOut} className="flex items-center gap-3">
            <Link href={`/authors/${me.slug}`} className="flex items-center gap-2 text-white/80 hover:text-yellow" title="View your public profile">
              <Avatar src={me.imageUrl} name={me.name} size={32} />
              <span className="max-sm:hidden">{me.name.split(" ")[0]}</span>
            </Link>
            <button className="font-bold text-white/70 hover:text-yellow">Sign out</button>
          </form>
        }
      />
      {changes > 0 && (
        <div className="bg-yellow">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-2 text-sm font-bold sm:px-6 lg:px-8">
            {changes === 1 ? "An editor has asked for changes on one piece." : `An editor has asked for changes on ${changes} pieces.`}{" "}
            <Link href="/write/articles" className="underline">See the feedback</Link>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
