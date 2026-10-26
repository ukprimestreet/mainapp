import { db } from "./db";
import { audit, type Actor } from "./audit";

/**
 * Lead credits.
 *
 * A ledger, not a mutable number. `CreditAccount.balance` is a cached sum; every movement writes a
 * `CreditTransaction` with its reason and the balance it produced, so any figure can be recomputed from
 * scratch and any dispute answered. Losing the trail on something that is money in all but name is not a
 * trade worth making.
 *
 * Price: **£1 per credit, excluding VAT** (decision D4). VAT is added at checkout when it legally applies,
 * which is the purchase flow's job — nothing here knows or cares about tax.
 *
 * Three rules this file exists to enforce:
 *   1. The welcome grant happens **once** per business, ever.
 *   2. A credit cannot be spent twice, and two concurrent spends cannot both take the last one.
 *   3. Nothing moves without a reason recorded against it.
 */

export const CREDIT_PRICE_PENCE = 100; // £1, excluding VAT
export const WELCOME_CREDITS = 5;
export const LOW_BALANCE_THRESHOLD = 2;

export type CreditKind = "FREE_GRANT" | "PURCHASE" | "CONSUMPTION" | "REFUND" | "ADJUSTMENT" | "REVERSAL";

/** The account, created on first use. Safe to call concurrently. */
export async function creditAccount(businessId: string) {
  const existing = await db.creditAccount.findUnique({ where: { businessId } });
  if (existing) return existing;
  try {
    return await db.creditAccount.create({ data: { businessId } });
  } catch {
    // Lost a race to another request; the unique index did its job.
    return (await db.creditAccount.findUnique({ where: { businessId } }))!;
  }
}

export const creditBalance = async (businessId: string) =>
  (await db.creditAccount.findUnique({ where: { businessId }, select: { balance: true } }))?.balance ?? 0;

/**
 * The once-only welcome grant.
 *
 * Guarded three ways, because "five free credits" is exactly the kind of thing that gets farmed:
 *   - `freeGrantAt` on the account,
 *   - a unique index allowing at most one `FREE_GRANT` row per business,
 *   - a conditional update, so two simultaneous calls cannot both pass the check.
 *
 * Returns what happened rather than throwing: a second call is not an error, it is a no-op.
 */
export async function grantWelcomeCredits(businessId: string, reason: string, actor?: Actor) {
  const account = await creditAccount(businessId);
  if (account.freeGrantAt) return { granted: false as const, reason: "already granted" as const, balance: account.balance };

  // Claim the grant atomically: only the call that sets freeGrantAt from null proceeds.
  const claimed = await db.creditAccount.updateMany({
    where: { id: account.id, freeGrantAt: null },
    data: { freeGrantAt: new Date(), balance: { increment: WELCOME_CREDITS } },
  });
  if (claimed.count !== 1) {
    const now = await db.creditAccount.findUnique({ where: { id: account.id } });
    return { granted: false as const, reason: "already granted" as const, balance: now?.balance ?? 0 };
  }

  const after = (await db.creditAccount.findUnique({ where: { id: account.id } }))!;
  try {
    await db.creditTransaction.create({
      data: {
        accountId: account.id, businessId, delta: WELCOME_CREDITS, balanceAfter: after.balance,
        kind: "FREE_GRANT", reason,
      },
    });
  } catch {
    // The unique index refused a second FREE_GRANT. The balance change is already claimed and correct;
    // there is nothing to undo and nothing to hide.
  }
  await audit({ action: "Welcome credits granted", targetType: "Business", targetId: businessId, detail: `${WELCOME_CREDITS} credits: ${reason}` }, actor);
  return { granted: true as const, credits: WELCOME_CREDITS, balance: after.balance };
}

/**
 * Spends one credit for a lead assignment.
 *
 * The conditional update is the whole safeguard: `balance >= amount` is checked **in the same statement**
 * that decrements it, so two concurrent assignments cannot both take the last credit. Checking first and
 * writing afterwards is the bug this avoids.
 */
export async function spendCredits(businessId: string, amount: number, reason: string, assignmentId?: string) {
  if (amount <= 0) throw new Error("spendCredits needs a positive amount");
  const account = await creditAccount(businessId);

  const spent = await db.creditAccount.updateMany({
    where: { id: account.id, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  });
  if (spent.count !== 1) return { ok: false as const, reason: "insufficient credits" as const, balance: account.balance };

  const after = (await db.creditAccount.findUnique({ where: { id: account.id } }))!;
  await db.creditTransaction.create({
    data: {
      accountId: account.id, businessId, delta: -amount, balanceAfter: after.balance,
      kind: "CONSUMPTION", reason, assignmentId: assignmentId ?? null,
    },
  });
  return { ok: true as const, balance: after.balance };
}

/** Puts a credit back when an assignment failed before delivery. Never silently: it is a ledger row. */
export async function reverseCredits(businessId: string, amount: number, reason: string, assignmentId?: string) {
  const account = await creditAccount(businessId);
  await db.creditAccount.update({ where: { id: account.id }, data: { balance: { increment: amount } } });
  const after = (await db.creditAccount.findUnique({ where: { id: account.id } }))!;
  await db.creditTransaction.create({
    data: { accountId: account.id, businessId, delta: amount, balanceAfter: after.balance, kind: "REVERSAL", reason, assignmentId: assignmentId ?? null },
  });
  await audit({ action: "Lead credit reversed", targetType: "Business", targetId: businessId, detail: `${amount}: ${reason}` });
  return { balance: after.balance };
}

/** An administrator moving the balance by hand. Requires a reason and names who did it. */
export async function adjustCredits(businessId: string, delta: number, reason: string, adminId: string | null, actor?: Actor) {
  if (delta === 0) throw new Error("An adjustment of zero is not an adjustment");
  if (reason.trim().length < 5) throw new Error("An adjustment needs a reason the business could be shown");
  const account = await creditAccount(businessId);

  if (delta < 0) {
    const ok = await db.creditAccount.updateMany({ where: { id: account.id, balance: { gte: -delta } }, data: { balance: { decrement: -delta } } });
    if (ok.count !== 1) return { ok: false as const, reason: "that would take the balance below zero" as const };
  } else {
    await db.creditAccount.update({ where: { id: account.id }, data: { balance: { increment: delta } } });
  }

  const after = (await db.creditAccount.findUnique({ where: { id: account.id } }))!;
  await db.creditTransaction.create({
    data: { accountId: account.id, businessId, delta, balanceAfter: after.balance, kind: "ADJUSTMENT", reason, adminId },
  });
  await audit({ action: "Lead credits adjusted", targetType: "Business", targetId: businessId, detail: `${delta > 0 ? "+" : ""}${delta}: ${reason}` }, actor);
  return { ok: true as const, balance: after.balance };
}

/** Credits added after a verified payment. Only ever called from a confirmed webhook. */
export async function creditPurchase(businessId: string, quantity: number, orderId: string, reason: string) {
  const account = await creditAccount(businessId);
  // Idempotent on the order: a duplicate webhook must not grant twice.
  const already = await db.creditTransaction.findFirst({ where: { businessId, orderId, kind: "PURCHASE" } });
  if (already) return { ok: false as const, reason: "already credited for this order" as const, balance: account.balance };

  await db.creditAccount.update({ where: { id: account.id }, data: { balance: { increment: quantity } } });
  const after = (await db.creditAccount.findUnique({ where: { id: account.id } }))!;
  await db.creditTransaction.create({
    data: { accountId: account.id, businessId, delta: quantity, balanceAfter: after.balance, kind: "PURCHASE", reason, orderId },
  });
  return { ok: true as const, balance: after.balance };
}

export const creditHistory = (businessId: string, take = 50) =>
  db.creditTransaction.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take });

/**
 * Recomputes the balance from the ledger. The cached figure should always agree; this is how we prove it,
 * and how we would find out if it ever did not.
 */
export async function reconcile(businessId: string) {
  const rows = await db.creditTransaction.findMany({ where: { businessId }, select: { delta: true } });
  const fromLedger = rows.reduce((n, r) => n + r.delta, 0);
  const cached = await creditBalance(businessId);
  return { fromLedger, cached, agrees: fromLedger === cached };
}
