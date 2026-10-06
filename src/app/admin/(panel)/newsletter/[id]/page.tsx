import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SEND_LIMIT, renderForRecipient } from "@/lib/newsletter";
import { saveIssue, sendIssue, sendTest } from "../../../newsletter-actions";

export default async function IssuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const issue = await db.newsletterIssue.findUnique({ where: { id } });
  if (!issue) notFound();
  const active = await db.newsletterSubscriber.count({ where: { status: "ACTIVE" } });
  const field = "min-h-11 w-full rounded-lg border-2 border-line px-3 py-2";
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/newsletter" className="underline">← Newsletter</Link></p>
      <h1 className="mb-4 text-3xl font-extrabold">{issue.sentAt ? "Sent issue" : "Draft issue"}</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form action={saveIssue} className="min-w-0 space-y-4"><input type="hidden" name="id" value={issue.id} />
          <div><label htmlFor="subject" className="mb-1 block font-bold">Subject</label><input id="subject" name="subject" defaultValue={issue.subject} readOnly={!!issue.sentAt} className={field} /></div>
          <div><label htmlFor="body" className="mb-1 block font-bold">Body (plain text — keep <code>{"{{unsubscribe}}"}</code>)</label><textarea id="body" name="body" rows={22} defaultValue={issue.body} readOnly={!!issue.sentAt} className={`${field} font-mono text-sm`} /></div>
          {!issue.sentAt && <button className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow">Save draft</button>}
        </form>
        <aside className="space-y-6">
          {!issue.sentAt ? (
            <>
              <form action={sendTest} className="rounded-xl border-2 border-line p-4"><input type="hidden" name="id" value={issue.id} /><p className="mb-2 font-bold">1 · Send yourself a test</p><button className="min-h-11 rounded-full border-2 border-ink px-5 font-bold">Send test</button></form>
              <form action={sendIssue} className="rounded-xl border-2 border-ink p-4"><input type="hidden" name="id" value={issue.id} /><p className="mb-2 font-bold">2 · Send to subscribers</p>
                <p className="mb-3 text-sm text-grey">{active} active subscriber{active === 1 ? "" : "s"}. Up to {SEND_LIMIT} per issue for now. This can&apos;t be undone.</p>
                <label className="mb-3 flex items-start gap-2 text-sm font-bold"><input type="checkbox" name="confirm" className="mt-1 h-5 w-5" /> I&apos;ve checked the test and want to send this to everyone</label>
                <button className="min-h-11 w-full rounded-full bg-yellow font-bold hover:bg-yellow-hover">Send now</button></form>
            </>
          ) : <p className="rounded-xl bg-mist p-4 font-bold">Sent to {issue.recipients} subscribers.</p>}
          <div><p className="mb-1 text-sm font-bold">Preview of the footer each reader gets</p><pre className="whitespace-pre-wrap rounded-lg bg-mist p-3 text-xs [overflow-wrap:anywhere]">{renderForRecipient("{{unsubscribe}}", "SUBSCRIBER_ID")}</pre></div>
        </aside>
      </div>
    </>
  );
}
