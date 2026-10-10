import Link from "next/link";
import { Cell, Chip, DashTable, Notice, Panel, Row, Stat, StatRow } from "@/components/Dash";
import { TEMPLATES } from "@/lib/email/templates";
import { BUSINESS_TEMPLATES } from "@/lib/email/business-templates";
import { previewBusinessTemplate, previewTemplate } from "@/lib/email/send";
import { SENDERS } from "@/lib/mail";

export const dynamic = "force-dynamic";

const AUDIENCE = { writer: "Writers", owner: "Business owners", reviewer: "Reviewers", reader: "Readers", team: "The team" } as const;

export default async function Templates({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const shown = id ? (previewTemplate(id) ?? previewBusinessTemplate(id)) : null;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/outbox" className="font-bold underline">← Email</Link></p>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold">Email templates</h1>
        <p className="mt-1 text-grey">Every email PrimeStreet can send, with the data it needs. One layout, so the brand can never drift apart.</p>
      </div>

      <StatRow cols={3}>
        <Stat label="Templates" value={TEMPLATES.length + BUSINESS_TEMPLATES.length} tone="accent" hint={`${BUSINESS_TEMPLATES.length} in the business programme`} />
        <Stat label="Senders" value={Object.keys(SENDERS).length} hint="One address per purpose" />
        <Stat label="Audiences" value={new Set(TEMPLATES.map((t) => t.to)).size} hint="Writers, owners, reviewers, readers, team" />
      </StatRow>

      {shown && (
        <Panel title={shown.tpl.name} description={shown.subject} action={<Link href="/admin/outbox/templates" className="font-bold underline">Close</Link>}>
          <Notice tone="info" title="Preview">
            Rendered with sample data, from <strong>{shown.tpl.purpose}@</strong>. This is exactly what a recipient sees.
          </Notice>
          <iframe title={`Preview of ${shown.tpl.name}`} srcDoc={shown.html} className="h-[820px] w-full rounded-xl border-2 border-line bg-white" />
          <details className="mt-4">
            <summary className="cursor-pointer font-bold">Plain-text version</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-mist p-4 text-xs text-grey">{shown.text}</pre>
          </details>
        </Panel>
      )}

      <Panel title="Business lifecycle programme" description="What fires each one, and what it is for commercially. Service mail always sends; lifecycle stops on unsubscribe; marketing needs an opt-in.">
        <DashTable head={["Email", "Kind", "Trigger", "Commercial goal", ""]}>
          {BUSINESS_TEMPLATES.map((b) => (
            <Row key={b.id}>
              <Cell className="font-bold">{b.name}</Cell>
              <Cell><Chip tone={b.kind === "marketing" ? "review" : b.kind === "service" ? "live" : "quiet"}>{b.kind}</Chip></Cell>
              <Cell className="text-grey">{b.trigger}</Cell>
              <Cell className="text-grey">{b.goal}</Cell>
              <Cell><Link href={`/admin/outbox/templates?id=${b.id}`} className="font-bold underline">Preview</Link></Cell>
            </Row>
          ))}
        </DashTable>
      </Panel>

      {(Object.keys(AUDIENCE) as (keyof typeof AUDIENCE)[]).map((who) => {
        const list = TEMPLATES.filter((t) => t.to === who);
        if (!list.length) return null;
        return (
          <Panel key={who} title={AUDIENCE[who]} description={`${list.length} ${list.length === 1 ? "template" : "templates"}`}>
            <DashTable head={["Template", "Sends from", "Subject", "What it is for", ""]}>
              {list.map((t) => (
                <Row key={t.id}>
                  <Cell className="font-bold">{t.name}</Cell>
                  <Cell><Chip tone={SENDERS[t.purpose].monitored ? "live" : "quiet"}>{t.purpose}@</Chip></Cell>
                  <Cell className="[overflow-wrap:anywhere]">{t.subject(t.sample as never)}</Cell>
                  <Cell className="text-grey">{t.about}</Cell>
                  <Cell><Link href={`/admin/outbox/templates?id=${t.id}`} className="font-bold underline">Preview</Link></Cell>
                </Row>
              ))}
            </DashTable>
          </Panel>
        );
      })}
    </>
  );
}
