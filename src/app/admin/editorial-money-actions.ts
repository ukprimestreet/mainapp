"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { sendMail, siteLink } from "@/lib/mail";
import { gbp } from "@/lib/commerce";
import { ARTICLE_TYPES } from "@/lib/constants";
import { payeeState } from "@/lib/payee";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const who = () => process.env.ADMIN_EMAIL ?? "admin";
const pence = (v: string) => {
  const n = Number(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

// ---------------------------------------------------------------- commissions
export async function offerCommission(form: FormData) {
  await requireAdmin();
  const back = (m: string): never => redirect(`/admin/commissions?msg=${encodeURIComponent(m)}`);
  const authorId = s(form, "authorId"), title = s(form, "title").trim(), brief = s(form, "brief").trim();
  const type = s(form, "type") || "NEWS";
  const fee = s(form, "fee").trim();
  const dueAt = s(form, "dueAt").trim();

  if (!authorId) back("Choose a writer.");
  if (title.length < 6) back("Give the commission a title the writer will understand.");
  if (brief.length < 40) back("Write a brief of at least 40 characters — a thin brief wastes the writer's time.");
  if (!(type in ARTICLE_TYPES)) back("Choose a section.");
  const feePence = fee ? pence(fee) : null;
  if (fee && feePence === null) back("Enter the fee as a number, for example 150.");
  if (dueAt && !/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) back("Choose a deadline date.");

  const author = await db.author.findUnique({ where: { id: authorId } });
  if (!author) back("That writer no longer exists.");

  const c = await db.commission.create({
    data: {
      authorId, title, brief, type, feePence, commissionedBy: who(),
      dueAt: dueAt ? new Date(`${dueAt}T12:00:00Z`) : null,
    },
  });

  await notify("AUTHOR", authorId, "COMMISSION", `New commission: ${title}`, feePence ? `${gbp(feePence)} agreed. Accept or decline it.` : "Accept or decline it.", "/write/commissions");
  if (author!.email) {
    await sendMail(
      author!.email,
      `A commission for you: ${title}`,
      [
        `${author!.name},`,
        "",
        `We would like to commission you to write "${title}".`,
        feePence
          ? `The fee is ${gbp(feePence)}, agreed before you start and not dependent on how the piece performs.`
          : "The fee is not set yet — tell us what you need for it.",
        dueAt ? `We would need it by ${dueAt}.` : "",
        "",
        "The brief:",
        brief,
        "",
        "Accept or decline it here — and do decline if it is not right for you or the deadline does not work. A quick no is more useful to us than a slow maybe:",
        siteLink("/write/commissions"),
      ].filter(Boolean).join("\n"),
      { purpose: "editorial" },
    );
  }
  await db.auditLog.create({ data: { action: "Commission offered", targetType: "Commission", targetId: c.id, detail: `${title} to ${author!.email} by ${who()}` } });
  back(`Offered "${title}" to ${author!.name}.`);
}

export async function cancelCommission(form: FormData) {
  await requireAdmin();
  const id = s(form, "id"), reason = s(form, "reason").trim();
  const back = (m: string): never => redirect(`/admin/commissions?msg=${encodeURIComponent(m)}`);
  const c = await db.commission.findUnique({ where: { id }, include: { author: true } });
  if (!c) back("That commission no longer exists.");
  if (c!.status === "DELIVERED") back("That one has been delivered. Cancelling it now would be dishonest — pay it.");
  if (reason.length < 5) back("Give a reason. A writer who has started work is owed an explanation.");

  const started = c!.status === "ACCEPTED";
  await db.commission.update({ where: { id }, data: { status: "CANCELLED", note: reason } });
  await notify("AUTHOR", c!.authorId, "COMMISSION", `Commission cancelled: ${c!.title}`, reason, "/write/commissions");
  if (c!.author.email) {
    await sendMail(
      c!.author.email,
      `We have cancelled: ${c!.title}`,
      [
        `${c!.author.name},`,
        "",
        `We have had to cancel the commission "${c!.title}". The reason:`,
        reason,
        "",
        started ? "If you had already started, tell us what you have done and we will pay for it. That is on us, not you." : "",
        started ? "" : null,
        "We are sorry for the wasted time.",
      ].filter((l) => l !== null && l !== "").join("\n"),
      { purpose: "editorial" },
    );
  }
  await db.auditLog.create({ data: { action: "Commission cancelled", targetType: "Commission", targetId: id, detail: `${reason} by ${who()}` } });
  back("Cancelled, and the writer has been told why.");
}

/** Marks a commission delivered and, in the same step, records what the writer is owed for it. */
export async function markDelivered(form: FormData) {
  await requireAdmin();
  const id = s(form, "id");
  const back = (m: string): never => redirect(`/admin/commissions?msg=${encodeURIComponent(m)}`);
  const c = await db.commission.findUnique({ where: { id }, include: { author: true } });
  if (!c) back("That commission no longer exists.");
  if (c!.status === "DELIVERED") back("Already marked delivered.");
  if (!c!.feePence) back("Set a fee on the commission before marking it delivered, so the writer has something to invoice.");

  await db.$transaction([
    db.commission.update({ where: { id }, data: { status: "DELIVERED" } }),
    db.writerPayment.create({
      data: { authorId: c!.authorId, amountPence: c!.feePence!, description: c!.title, articleId: c!.articleId, status: "DUE" },
    }),
  ]);
  const owed = payeeState(c!.author);
  await notify(
    "AUTHOR", c!.authorId, "PAYMENT", `${gbp(c!.feePence!)} is ready to invoice`,
    owed.payable ? `For "${c!.title}".` : `For "${c!.title}". We still need ${owed.missing.join(", ")} before we can pay you.`,
    owed.payable ? "/write/payments" : "/write/payments/details",
  );
  if (!owed.payable && c!.author.email) {
    await sendMail(
      c!.author.email,
      `${gbp(c!.feePence!)} is yours — we just need your payment details`,
      [
        `${c!.author.name},`,
        "",
        `"${c!.title}" is marked delivered and ${gbp(c!.feePence!)} is now owed to you. We cannot send it yet because we still need ${owed.missing.join(", ")}.`,
        "",
        "Add it here, in the dashboard you already sign in to:",
        siteLink("/write/payments/details"),
        "",
        "We will never ask for your bank details by email or over the phone, and this email does not ask you to reply with them. If anything claiming to be us does, it is not us.",
        "",
        "Nothing is lost in the meantime — what is owed stays owed.",
      ].join("\n"),
      { purpose: "billing" },
    );
  }
  await db.auditLog.create({ data: { action: "Commission delivered", targetType: "Commission", targetId: id, detail: `${gbp(c!.feePence!)} owed to ${c!.author.email}` } });
  back(`Delivered. ${gbp(c!.feePence!)} is now ready for ${c!.author.name} to invoice.`);
}

// ---------------------------------------------------------------- payments
/** A fee outside a commission: a pitch we took, an extra day, a kill fee. */
export async function addPayment(form: FormData) {
  await requireAdmin();
  const back = (m: string): never => redirect(`/admin/payments?msg=${encodeURIComponent(m)}`);
  const authorId = s(form, "authorId"), description = s(form, "description").trim();
  const amountPence = pence(s(form, "amount"));

  if (!authorId) back("Choose a writer.");
  if (description.length < 4) back("Say what the payment is for — the writer sees this wording.");
  if (amountPence === null || amountPence <= 0) back("Enter an amount, for example 150.");
  const amount = amountPence as number;

  const author = await db.author.findUnique({ where: { id: authorId } });
  if (!author) back("That writer no longer exists.");

  await db.writerPayment.create({ data: { authorId, amountPence: amount, description, status: "DUE" } });
  const payee = payeeState(author!);
  await notify(
    "AUTHOR", authorId, "PAYMENT", `${gbp(amount)} is ready to invoice`,
    payee.payable ? description : `${description}. We still need ${payee.missing.join(", ")} before we can pay you.`,
    payee.payable ? "/write/payments" : "/write/payments/details",
  );
  await db.auditLog.create({ data: { action: "Writer fee added", targetType: "Author", targetId: authorId, detail: `${gbp(amount)} — ${description} by ${who()}` } });
  back(`${gbp(amount)} added for ${author!.name} to invoice.`);
}

export async function approvePayments(form: FormData) {
  await requireAdmin();
  const back = (m: string): never => redirect(`/admin/payments?msg=${encodeURIComponent(m)}`);
  const ids = (form.getAll("payment") as string[]).filter(Boolean);
  if (!ids.length) back("Tick what you are approving.");

  const rows = await db.writerPayment.findMany({ where: { id: { in: ids }, status: "SUBMITTED" } });
  if (!rows.length) back("Those items are not waiting for approval.");

  await db.writerPayment.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "APPROVED", approvedBy: who() } });
  for (const r of rows) {
    await notify("AUTHOR", r.authorId, "PAYMENT", `${gbp(r.amountPence)} approved for payment`, `For "${r.description}". It will go out in the next payment run.`, "/write/payments");
  }
  await db.auditLog.create({ data: { action: "Writer payments approved", targetType: "WriterPayment", targetId: rows.map((r) => r.id).join(","), detail: `${rows.length} item(s) by ${who()}` } });
  back(`Approved ${rows.length} ${rows.length === 1 ? "item" : "items"}. Mark them paid once the money has actually gone.`);
}

/** Marks money as actually sent. Deliberately separate from approval: approving is not paying. */
export async function markPaid(form: FormData) {
  await requireAdmin();
  const back = (m: string): never => redirect(`/admin/payments?msg=${encodeURIComponent(m)}`);
  const ids = (form.getAll("payment") as string[]).filter(Boolean);
  if (!ids.length) back("Tick what you have paid.");

  const rows = await db.writerPayment.findMany({ where: { id: { in: ids }, status: "APPROVED" }, include: { author: true } });
  if (!rows.length) back("Those items have not been approved yet, so they cannot be marked paid.");

  await db.writerPayment.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "PAID", paidAt: new Date() } });

  // One email per writer rather than one per line, with the total they should expect to see land.
  const byAuthor = new Map<string, { email: string | null; name: string; total: number; items: string[] }>();
  for (const r of rows) {
    const e = byAuthor.get(r.authorId) ?? { email: r.author.email, name: r.author.name, total: 0, items: [] as string[] };
    e.total += r.amountPence;
    e.items.push(`${r.description} — ${gbp(r.amountPence)}`);
    byAuthor.set(r.authorId, e);
  }
  for (const [authorId, a] of byAuthor) {
    await notify("AUTHOR", authorId, "PAYMENT", `${gbp(a.total)} paid`, a.items.join("; "), "/write/payments");
    if (a.email) {
      await sendMail(
        a.email,
        `${gbp(a.total)} is on its way to you`,
        [
          `${a.name},`,
          "",
          `We have paid ${gbp(a.total)} for:`,
          ...a.items.map((i) => `· ${i}`),
          "",
          "It should reach your account within a few working days. If it has not arrived in five, chase us — we would far rather be chased than leave you out of pocket.",
          "",
          siteLink("/write/payments"),
        ].join("\n"),
        { purpose: "billing" },
      );
    }
  }
  await db.auditLog.create({ data: { action: "Writer payments paid", targetType: "WriterPayment", targetId: rows.map((r) => r.id).join(","), detail: `${gbp(rows.reduce((n, r) => n + r.amountPence, 0))} by ${who()}` } });
  back(`Marked ${rows.length} ${rows.length === 1 ? "item" : "items"} paid.`);
}

/** A query on an invoice, which puts the line back in the writer's list rather than writing it off. */
export async function queryInvoice(form: FormData) {
  await requireAdmin();
  const back = (m: string): never => redirect(`/admin/payments?msg=${encodeURIComponent(m)}`);
  const id = s(form, "id"), reason = s(form, "reason").trim();
  if (reason.length < 5) back("Give a reason — the writer sees it, and “rejected” on its own is not an answer.");

  const r = await db.writerPayment.findUnique({ where: { id }, include: { author: true } });
  if (!r || r.status !== "SUBMITTED") back("That item is not waiting for approval.");

  await db.writerPayment.update({ where: { id }, data: { status: "DUE", reference: null, periodMonth: null } });
  await notify("AUTHOR", r!.authorId, "PAYMENT", `A query on your invoice for "${r!.description}"`, reason, "/write/payments");
  if (r!.author.email) {
    await sendMail(
      r!.author.email,
      `A query on your invoice: ${r!.description}`,
      [
        `${r!.author.name},`,
        "",
        `We have a query on the invoice for "${r!.description}" (${gbp(r!.amountPence)}):`,
        reason,
        "",
        "It is back in your list ready to invoice again once that is sorted. Nothing has been written off and nothing is lost.",
        "",
        siteLink("/write/payments"),
      ].join("\n"),
      { purpose: "billing" },
    );
  }
  await db.auditLog.create({ data: { action: "Writer invoice queried", targetType: "WriterPayment", targetId: id, detail: `${reason} by ${who()}` } });
  back("Sent back to the writer with your query.");
}

/**
 * Shows one writer's bank details to an admin, and records that it happened.
 *
 * A reveal is a deliberate act with a name against it, rather than account numbers sitting on screen for
 * anyone walking past. The audit entry says who looked and when, never what they saw.
 */
export async function revealBankDetails(form: FormData) {
  await requireAdmin();
  const authorId = s(form, "authorId");
  const author = await db.author.findUnique({ where: { id: authorId } });
  if (!author) redirect(`/admin/payments?msg=${encodeURIComponent("That writer no longer exists.")}`);
  await db.auditLog.create({
    data: { action: "Writer bank details viewed", targetType: "Author", targetId: authorId, detail: `${author!.email ?? authorId} viewed by ${who()}` },
  });
  redirect(`/admin/payments?reveal=${authorId}`);
}
