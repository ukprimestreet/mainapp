import Link from "next/link";
import { headers } from "next/headers";
import { AccountBlock, DashLayout, type NavGroup } from "@/components/Dash";
import { Avatar } from "@/components/Social";
import { requireAuthor } from "@/lib/author-auth";
import { completeness } from "@/lib/author-profile";
import { db } from "@/lib/db";
import { authorSignOut } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Writers' desk — PrimeStreet", robots: { index: false, follow: false } };

export default async function WritePanelLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAuthor();
  const [drafts, inReview, changes] = await Promise.all([
    db.article.count({ where: { authorId: me.id, status: "DRAFT" } }),
    db.article.count({ where: { authorId: me.id, status: "SUBMITTED" } }),
    db.article.count({ where: { authorId: me.id, status: "DRAFT", reviews: { some: { decision: "CHANGES_REQUESTED" } } } }),
  ]);
  const c = completeness(me);

  const groups: NavGroup[] = [
    { title: "Writing", items: [
      { href: "/write", label: "Dashboard", icon: "home", exact: true },
      { href: "/write/articles", label: "My work", icon: "file", badge: drafts + inReview },
    ] },
    { title: "You", items: [
      { href: "/write/profile", label: "Profile", icon: "users", badge: c.enough && c.termsAccepted ? undefined : 1 },
      { href: "/write/terms", label: "Author terms", icon: "shield" },
    ] },
  ];

  const active = (await headers()).get("x-ps-path") ?? "/write";

  return (
    <DashLayout
      title="Writers' desk"
      active={active}
      groups={groups}
      account={
        <AccountBlock name={me.name} sub={me.email ?? undefined} avatar={<Avatar src={me.imageUrl} name={me.name} size={36} />}>
          <Link href={`/authors/${me.slug}`} className="hover:text-yellow">My public page</Link>
          <form action={authorSignOut}><button className="hover:text-yellow">Sign out</button></form>
        </AccountBlock>
      }
    >
      {changes > 0 && (
        <div className="mb-7 rounded-2xl border-2 border-ink bg-yellow p-4 text-[15px] font-bold">
          {changes === 1 ? "An editor has asked for changes on one piece." : `An editor has asked for changes on ${changes} pieces.`}{" "}
          <Link href="/write/articles" className="underline">See the feedback</Link>
        </div>
      )}
      {children}
    </DashLayout>
  );
}
