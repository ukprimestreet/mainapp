import { Cell, Chip, DashTable, Empty, Notice, Panel, Row, Stat, StatRow } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";
import { SENDERS, SUPPORT_EMAIL, mailConfigured, senderAddress, type MailPurpose } from "@/lib/mail";

export const dynamic = "force-dynamic";

export default async function Outbox({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  const { purpose } = await searchParams;
  const filter = purpose && purpose in SENDERS ? (purpose as MailPurpose) : undefined;
  const [rows, sent, failed, pending, byPurpose] = await Promise.all([
    db.emailOutbox.findMany({ where: filter ? { purpose: filter } : {}, orderBy: { createdAt: "desc" }, take: 60 }),
    db.emailOutbox.count({ where: { sentAt: { not: null } } }),
    db.emailOutbox.count({ where: { error: { not: null } } }),
    db.emailOutbox.count({ where: { sentAt: null, error: null } }),
    db.emailOutbox.groupBy({ by: ["purpose"], _count: { _all: true } }),
  ]);
  const configured = mailConfigured();
  const support = SUPPORT_EMAIL();
  const count = (p: string) => byPurpose.find((b) => b.purpose === p)?._count._all ?? 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold">Email</h1>
        <p className="mt-1 text-grey">Everything PrimeStreet has tried to send, and which address it went from.</p>
      </div>

      {configured ? (
        <Notice tone="good" title="Sending">
          Mail is going out through Resend. Only <strong>{support}</strong> is a monitored inbox — every other sender appends a note
          telling the reader not to reply and to write to {support} instead.
        </Notice>
      ) : (
        <Notice tone="warn" title="Not sending yet">
          <code>RESEND_API_KEY</code> and <code>MAIL_DOMAIN</code> are not both set, so mail is recorded here but never delivered.
          Nothing is lost: once they are set, new mail sends.
        </Notice>
      )}

      <StatRow cols={3}>
        <Stat label="Delivered" value={sent} tone={sent ? "accent" : "plain"} />
        <Stat label="Failed" value={failed} tone={failed ? "warn" : "plain"} hint={failed ? "Check the error on the message" : "None"} />
        <Stat label="Recorded, not sent" value={pending} hint={configured ? "Queued or provider was down" : "No provider configured"} />
      </StatRow>

      <Panel title="Senders" description="One address per purpose, so recipients can tell at a glance what an email is about.">
        <DashTable head={["Purpose", "Sends from", "Inbox", "Used for", "Sent"]}>
          {(Object.keys(SENDERS) as MailPurpose[]).map((p) => (
            <Row key={p}>
              <Cell className="font-bold">{p}</Cell>
              <Cell className="[overflow-wrap:anywhere]"><code>{senderAddress(p)}</code></Cell>
              <Cell>{SENDERS[p].monitored ? <Chip tone="live">Monitored</Chip> : <Chip tone="quiet">Send only</Chip>}</Cell>
              <Cell className="text-grey">{SENDERS[p].about}</Cell>
              <Cell className="font-display text-lg font-extrabold">{count(p)}</Cell>
            </Row>
          ))}
        </DashTable>
      </Panel>

      <Panel
        title={filter ? `${filter} mail` : "Recent mail"}
        action={
          <div className="flex flex-wrap gap-2 text-sm">
            <a href="/admin/outbox" className={`font-bold ${filter ? "underline" : "text-grey"}`}>All</a>
            {(Object.keys(SENDERS) as MailPurpose[]).filter((p) => count(p) > 0).map((p) => (
              <a key={p} href={`/admin/outbox?purpose=${p}`} className={`font-bold ${filter === p ? "text-grey" : "underline"}`}>{p}</a>
            ))}
          </div>
        }
      >
        {rows.length === 0 ? (
          <Empty title="Nothing here yet">Emails appear as soon as the site tries to send one.</Empty>
        ) : (
          <ul className="space-y-4">
            {rows.map((m) => (
              <li key={m.id} className="rounded-xl border border-line p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold [overflow-wrap:anywhere]">{m.subject}</p>
                  {m.sentAt ? <Chip tone="live">Delivered</Chip> : m.error ? <Chip tone="bad">Failed</Chip> : <Chip tone="draft">Not sent</Chip>}
                </div>
                <p className="mt-1 text-grey [overflow-wrap:anywhere]">
                  To {m.to} · from <code>{m.fromAddress ?? "—"}</code>
                  {m.replyTo ? <> · reply to <code>{m.replyTo}</code></> : null}
                  {" "}· {fmtDate(m.createdAt)}
                </p>
                {m.error && <p className="mt-1 font-bold text-red-800 [overflow-wrap:anywhere]">{m.error}</p>}
                <details className="mt-2">
                  <summary className="cursor-pointer font-bold">Show message</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-grey">{m.body}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
