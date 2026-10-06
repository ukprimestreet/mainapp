import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";

export default async function Outbox() {
  const rows = await db.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const configured = !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
  return (
    <>
      <h1 className="mb-2 text-3xl font-extrabold">Email outbox</h1>
      <p role="note" className="mb-6 rounded-lg border-2 border-ink p-3 text-sm font-semibold">{configured ? "Email provider configured (Resend). Delivery status shown per message." : "No email provider configured (RESEND_API_KEY + MAIL_FROM). Messages are recorded here but NOT delivered — reviewers cannot confirm their email until a provider is set up."}</p>
      {rows.length === 0 && <p className="text-grey">No emails yet.</p>}
      <ul className="space-y-4">{rows.map((m) => (
        <li key={m.id} className="rounded-xl border border-line p-4 text-sm"><p className="font-bold">{m.subject}</p><p className="text-grey">To {m.to} · {fmtDate(m.createdAt)} · {m.sentAt ? "sent" : m.error ? `failed: ${m.error}` : "not sent"}</p><pre className="mt-2 whitespace-pre-wrap break-words font-sans">{m.body}</pre></li>))}</ul>
    </>
  );
}
