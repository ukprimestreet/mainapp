import Link from "next/link";
import { Cell, Chip, DashTable, Empty, Notice, Panel, Progress, Row, Stat, StatRow, btn, field, labelCls } from "@/components/Dash";
import { Avatar } from "@/components/Social";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { MIN_TO_SUBMIT, completeness } from "@/lib/author-profile";
import { adminResetPassword, registerAuthor, reinvite, setAuthorActive } from "../../author-actions";
import { deleteAuthor } from "../../article-actions";

export const dynamic = "force-dynamic";

export default async function Authors({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const authors = await db.author.findMany({
    include: { _count: { select: { articles: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const pending = authors.filter((a) => !a.passwordHash && a.invitedAt);
  const live = authors.filter((a) => a.passwordHash && a.active);
  const notReady = live.filter((a) => completeness(a).percent < MIN_TO_SUBMIT || !a.acceptedTermsAt);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Writers</h1>
          <p className="mt-1 text-grey">Register a writer and they are emailed a link to set their own password.</p>
        </div>
      </div>
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <StatRow>
        <Stat label="Active writers" value={live.length} hint="Signed up and able to sign in" />
        <Stat label="Awaiting setup" value={pending.length} hint={pending.length ? "Invited, no password yet" : "None outstanding"} tone={pending.length ? "accent" : "plain"} />
        <Stat label="Can't file yet" value={notReady.length} hint={`Profile under ${MIN_TO_SUBMIT}% or terms not accepted`} tone={notReady.length ? "warn" : "plain"} />
        <Stat label="Published pieces" value={authors.reduce((n, a) => n + a._count.articles, 0)} />
      </StatRow>

      <Panel title="Register a writer" description="They receive an email to finish setting up their account. The invitation lasts seven days.">
        <form action={registerAuthor} className="grid max-w-3xl gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className={labelCls} htmlFor="a-name">Full name</label>
            <input id="a-name" name="name" required className={field} placeholder="Ada Writer" />
          </div>
          <div>
            <label className={labelCls} htmlFor="a-email">Email address</label>
            <input id="a-email" name="email" type="email" required className={field} placeholder="ada@example.com" />
          </div>
          <button className={btn()}>Send invitation</button>
        </form>
      </Panel>

      <Panel title={`Writers (${authors.length})`}>
        {authors.length === 0 ? (
          <Empty title="No writers yet">Register the first one above.</Empty>
        ) : (
          <DashTable head={["Writer", "Account", "Profile", "Pieces", "Last signed in", ""]}>
            {authors.map((a) => {
              const c = completeness(a);
              const ready = c.percent >= MIN_TO_SUBMIT && !!a.acceptedTermsAt;
              return (
                <Row key={a.id}>
                  <Cell>
                    <div className="flex items-center gap-3">
                      <Avatar src={a.imageUrl} name={a.name} size={38} />
                      <div className="min-w-0">
                        <Link href={`/admin/authors/${a.id}`} className="font-bold underline [overflow-wrap:anywhere]">{a.name}</Link>
                        <p className="text-xs text-grey [overflow-wrap:anywhere]">{a.email ?? "no email"}{a.role ? ` · ${a.role}` : ""}</p>
                      </div>
                    </div>
                  </Cell>
                  <Cell>
                    {!a.active ? <Chip tone="bad">Suspended</Chip>
                      : a.passwordHash ? <Chip tone="live">Active</Chip>
                      : a.invitedAt ? <Chip tone="review">Invited {fmtDate(a.invitedAt)}</Chip>
                      : <Chip tone="draft">No account</Chip>}
                  </Cell>
                  <Cell className="min-w-[180px]">
                    <Progress percent={c.percent} target={MIN_TO_SUBMIT} label={ready ? "Can file" : "Can't file"} />
                    {!a.acceptedTermsAt && <p className="mt-1 text-xs text-grey">Terms not accepted</p>}
                  </Cell>
                  <Cell className="font-display text-lg font-extrabold">{a._count.articles}</Cell>
                  <Cell className="whitespace-nowrap text-grey">{a.lastLoginAt ? fmtDate(a.lastLoginAt) : "never"}</Cell>
                  <Cell>
                    <div className="flex flex-col gap-1 text-sm">
                      {!a.passwordHash && a.email && (
                        <form action={reinvite}><input type="hidden" name="id" value={a.id} /><button className="font-bold underline">Resend invite</button></form>
                      )}
                      {a.passwordHash && a.email && (
                        <form action={adminResetPassword}><input type="hidden" name="id" value={a.id} /><button className="font-bold underline">Send reset</button></form>
                      )}
                      <form action={setAuthorActive}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="active" value={a.active ? "0" : "1"} />
                        <button className={`font-bold underline ${a.active ? "text-red-800" : ""}`}>{a.active ? "Suspend" : "Reinstate"}</button>
                      </form>
                      {a._count.articles === 0 && (
                        <form action={deleteAuthor}><input type="hidden" name="id" value={a.id} /><button className="font-bold text-red-800 underline">Delete</button></form>
                      )}
                    </div>
                  </Cell>
                </Row>
              );
            })}
          </DashTable>
        )}
      </Panel>
    </>
  );
}
