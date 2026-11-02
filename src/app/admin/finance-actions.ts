"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (to: string, msg: string): never => redirect(`${to}?msg=${encodeURIComponent(msg)}`);
const P = "/admin/finance";

// EXPENSE_CATEGORIES now lives in lib/expense-categories.ts: a "use server" file may only export async
// functions, and exporting this array from here broke the build.

/** Manual expense entry — category, date, amount, recurring status, per the brief. */
export async function addExpense(fd: FormData) {
  const session = await requirePermission("money.view");
  const category = s(fd, "category");
  const description = s(fd, "description");
  const amountPence = Math.round(parseFloat(s(fd, "amountGbp") || "0") * 100);
  const date = new Date(`${s(fd, "date")}T00:00:00Z`);
  const recurring = fd.get("recurring") === "on";
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return back(P, "Choose a category");
  if (description.length < 3) return back(P, "Describe the expense");
  if (!Number.isFinite(amountPence) || amountPence <= 0) return back(P, "Enter an amount greater than £0");
  if (isNaN(date.getTime())) return back(P, "Enter a valid date");
  const createdBy = session.kind === "USER" ? session.admin.email : "admin";
  const row = await db.expense.create({ data: { category, description, amountPence, date, recurring, createdBy } });
  await auditLog("EXPENSE_RECORDED", "Expense", row.id, `${category} £${(amountPence / 100).toFixed(2)} ${description.slice(0, 100)}`);
  revalidatePath(P);
  back(P, "Expense recorded");
}

export async function deleteExpense(fd: FormData) {
  await requirePermission("money.view");
  const id = s(fd, "id");
  const row = await db.expense.delete({ where: { id } }).catch(() => null);
  if (row) await auditLog("EXPENSE_DELETED", "Expense", id, `${row.category} £${(row.amountPence / 100).toFixed(2)}`);
  revalidatePath(P);
  back(P, row ? "Expense removed" : "Not found");
}

/**
 * Manually records a refund against a PAID order, because Stripe's `charge.refunded` webhook carries a
 * charge/payment-intent id we do not currently store against an Order — matching it automatically would be
 * guesswork. An admin confirms the order and the refund is recorded against it explicitly, with who did it.
 */
export async function markOrderRefunded(fd: FormData) {
  await requirePermission("refunds.issue");
  const id = s(fd, "id");
  const order = await db.order.findUnique({ where: { id } });
  if (!order) return back(P, "Order not found");
  if (order.status !== "PAID") return back(P, "Only a paid order can be refunded");
  await db.order.update({ where: { id }, data: { status: "REFUNDED" } });
  await auditLog("ORDER_REFUNDED", "Order", id, `${order.productKey} £${(order.amountPence / 100).toFixed(2)}`);
  revalidatePath(P);
  back(P, "Order marked refunded");
}
