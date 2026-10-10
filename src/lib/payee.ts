import { db } from "./db";
import { decryptJson, encryptionReady, last4, type BankDetails } from "./secretbox";

/**
 * What we need in order to actually pay a writer, and how complete it is.
 *
 * Deliberately NOT part of the 90% profile gate: payment details are a condition of being paid, not of being
 * allowed to write. Asking for someone's bank details before they have been commissioned is the behaviour of
 * a scam, and we are not going to look like one.
 */
export type PayeeFields = {
  payeeName: string | null;
  payeeAddress: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  utrEnc: string | null;
  bankEnc: string | null;
  bankLast4: string | null;
  bankUpdatedAt: Date | null;
};

export type PayeeState = {
  /** Enough to send money: a payee name, an address for the invoice, and an account. */
  payable: boolean;
  missing: string[];
  hasBank: boolean;
  masked: string | null;
};

export function payeeState(a: PayeeFields): PayeeState {
  const missing: string[] = [];
  if (!a.payeeName?.trim()) missing.push("the name money should be paid to");
  if (!a.payeeAddress?.trim()) missing.push("an address for your invoices");
  if (!a.bankEnc) missing.push("bank details");
  if (a.vatRegistered && !a.vatNumber?.trim()) missing.push("your VAT number");
  return {
    payable: missing.length === 0,
    missing,
    hasBank: !!a.bankEnc,
    masked: a.bankLast4 ? `•••• ${a.bankLast4}` : null,
  };
}

/** Decrypts an account for the one screen that needs it. Returns null if the key is wrong, missing or rotated away. */
export const readBank = (a: { bankEnc: string | null }): BankDetails | null => decryptJson<BankDetails>(a.bankEnc);

export const canStoreDetails = () => encryptionReady();

/**
 * Writers with money waiting and nowhere to send it. Used to warn an admin before a payment run, because
 * "approved" is worthless to someone if we then cannot pay them.
 */
export async function unpayableWithMoneyDue() {
  const rows = await db.writerPayment.findMany({
    where: { status: { in: ["DUE", "SUBMITTED", "APPROVED"] } },
    include: { author: true },
  });
  const byAuthor = new Map<string, { name: string; email: string | null; pence: number; state: PayeeState }>();
  for (const r of rows) {
    const state = payeeState(r.author);
    if (state.payable) continue;
    const e = byAuthor.get(r.authorId) ?? { name: r.author.name, email: r.author.email, pence: 0, state };
    e.pence += r.amountPence;
    byAuthor.set(r.authorId, e);
  }
  return [...byAuthor.entries()].map(([authorId, v]) => ({ authorId, ...v }));
}

export { last4 };
