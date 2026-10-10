"use server";

import { redirect } from "next/navigation";
import { requireAuthor } from "@/lib/author-auth";
import { db } from "@/lib/db";
import {
  encryptJson, encryptField, encryptionReady, last4, normaliseSortCode, normaliseUtr, normaliseVatNumber,
  validateBank, validateUtr, validateVatNumber, type BankDetails,
} from "@/lib/secretbox";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();

/**
 * Saves a writer's payment details. The account number and UTR are encrypted before they reach the database.
 *
 * Nothing here is ever written to the audit log, an email or a notification: those are all places a value
 * outlives the one screen it belongs on. The audit log records *that* details changed, never what they are.
 */
export async function savePayeeDetails(form: FormData) {
  const me = await requireAuthor();
  const ok = (m: string): never => redirect(`/write/payments/details?msg=${encodeURIComponent(m)}`);
  const bad = (m: string): never => redirect(`/write/payments/details?err=${encodeURIComponent(m)}`);

  if (!encryptionReady()) bad("We cannot store these securely at the moment, so nothing was saved.");

  const payeeName = s(form, "payeeName").trim().slice(0, 140);
  const payeeAddress = s(form, "payeeAddress").trim().slice(0, 500);
  const vatRegistered = s(form, "vatRegistered") === "1";
  const vatNumberRaw = s(form, "vatNumber").trim();
  const utrRaw = s(form, "utr").trim();

  const accountName = s(form, "accountName").trim();
  const sortCode = s(form, "sortCode").trim();
  const accountNumber = s(form, "accountNumber").trim();
  const iban = s(form, "iban").trim();
  const swift = s(form, "swift").trim();
  // The bank block is never prefilled, so blank means "leave what is on file alone" and anything typed means
  // "replace it". That also keeps an unrelated save (an address change) from re-writing the stored account.
  const core = [accountName, sortCode, accountNumber];
  const anyBankField = [...core, iban, swift].some(Boolean);
  const allCorePresent = core.every(Boolean);

  if (vatRegistered && !vatNumberRaw) bad("Give your VAT number, or untick the VAT box.");
  if (vatNumberRaw) {
    const e = validateVatNumber(vatNumberRaw);
    if (e) bad(e);
  }
  if (utrRaw) {
    const e = validateUtr(utrRaw);
    if (e) bad(e);
  }

  const data: Record<string, unknown> = {
    payeeName: payeeName || null,
    payeeAddress: payeeAddress || null,
    vatRegistered,
    vatNumber: vatNumberRaw ? normaliseVatNumber(vatNumberRaw) : null,
  };

  // A blank UTR field means "leave what is on file alone", so a writer editing their address does not wipe it.
  if (utrRaw) data.utrEnc = encryptField(normaliseUtr(utrRaw));

  let bankChanged = false;
  if (anyBankField) {
    if (!allCorePresent) bad("To change your account, give the name on it, the sort code and the account number together.");
    const details: BankDetails = {
      accountName,
      sortCode: normaliseSortCode(sortCode),
      accountNumber: accountNumber.replace(/[^0-9]/g, ""),
      ...(iban ? { iban: iban.replace(/\s/g, "").toUpperCase() } : {}),
      ...(swift ? { swift: swift.replace(/\s/g, "").toUpperCase() } : {}),
    };
    const e = validateBank({ ...details, sortCode, accountNumber });
    if (e) bad(e);
    data.bankEnc = encryptJson(details);
    data.bankLast4 = last4(details.accountNumber);
    data.bankUpdatedAt = new Date();
    bankChanged = true;
  }

  await db.author.update({ where: { id: me.id }, data });
  await db.auditLog.create({
    data: {
      action: "Writer payment details changed",
      targetType: "Author",
      targetId: me.id,
      // What changed, never the values themselves.
      detail: `${me.email ?? me.id} updated ${[bankChanged ? "bank account" : null, utrRaw ? "UTR" : null, "payee and tax fields"].filter(Boolean).join(", ")}`,
    },
  });

  ok(bankChanged ? "Saved. Your account ends " + last4(accountNumber) + "." : "Saved.");
}

/** Removes everything we hold about how to pay someone, on their say-so. */
export async function clearPayeeDetails() {
  const me = await requireAuthor();
  await db.author.update({
    where: { id: me.id },
    data: { bankEnc: null, bankLast4: null, bankUpdatedAt: null, utrEnc: null },
  });
  await db.auditLog.create({
    data: { action: "Writer payment details removed", targetType: "Author", targetId: me.id, detail: `${me.email ?? me.id} removed their bank details and UTR` },
  });
  redirect(`/write/payments/details?msg=${encodeURIComponent("Removed. We no longer hold your bank details or UTR.")}`);
}
