"use server";

import { redirect } from "next/navigation";
import { requireAuthor } from "@/lib/author-auth";
import { db } from "@/lib/db";
import { markAllRead } from "@/lib/notify";
import { sendMail, siteLink } from "@/lib/mail";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();

/** Accept or decline a commission. Declining needs a reason so an editor can reassign quickly. */
export async function respondToCommission(form: FormData) {
  const me = await requireAuthor();
  const id = s(form, "id"), accept = s(form, "accept") === "1", note = s(form, "note").trim();
  const back = (m: string) => redirect(`/write/commissions?msg=${encodeURIComponent(m)}`);

  const c = await db.commission.findUnique({ where: { id } });
  if (!c || c.authorId !== me.id) back("That commission is not yours.");
  if (c!.status !== "OFFERED") back("You have already responded to this one.");
  if (!accept && note.length < 5) back("Add a short reason so an editor can reassign it.");

  await db.commission.update({
    where: { id },
    data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date(), note: note || null },
  });
  const admin = process.env.ADMIN_EMAIL;
  if (admin) {
    await sendMail(
      admin,
      `${me.name} ${accept ? "accepted" : "declined"}: ${c!.title}`,
      [`${me.name} has ${accept ? "accepted" : "declined"} the commission "${c!.title}".`, note ? `\nTheir note: ${note}` : "", `\n${siteLink("/admin/commissions")}`].join("\n"),
      { purpose: "alerts" },
    );
  }
  back(accept ? "Accepted. It now shows in your work." : "Declined. An editor has been told.");
}

/** Submit an invoice against work already approved. */
export async function submitInvoice(form: FormData) {
  const me = await requireAuthor();
  const ids = (form.getAll("payment") as string[]).filter(Boolean);
  const reference = s(form, "reference").trim();
  const back = (m: string) => redirect(`/write/payments?msg=${encodeURIComponent(m)}`);
  if (ids.length === 0) back("Tick at least one item to invoice.");
  if (reference.length < 2) back("Give your invoice a reference so you can match it to your own records.");

  const rows = await db.writerPayment.findMany({ where: { id: { in: ids }, authorId: me.id, status: "DUE" } });
  if (rows.length === 0) back("Those items are not available to invoice.");
  await db.writerPayment.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: "SUBMITTED", reference, periodMonth: new Date().toISOString().slice(0, 7) },
  });
  const total = rows.reduce((n, r) => n + r.amountPence, 0);
  const admin = process.env.ADMIN_EMAIL;
  if (admin) {
    await sendMail(
      admin,
      `Invoice ${reference} from ${me.name} — £${(total / 100).toFixed(2)}`,
      [`${me.name} has submitted invoice ${reference} for ${rows.length} item(s), totalling £${(total / 100).toFixed(2)}.`, "", siteLink("/admin/payments")].join("\n"),
      { purpose: "alerts" },
    );
  }
  back(`Invoice ${reference} submitted for £${(total / 100).toFixed(2)}.`);
}

export async function clearNotifications() {
  const me = await requireAuthor();
  await markAllRead("AUTHOR", me.id);
  redirect("/write/notifications");
}
