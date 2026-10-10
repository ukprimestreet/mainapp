import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";

/**
 * Authenticated encryption for the few fields we hold that would hurt someone if they leaked: a writer's bank
 * details and their tax references.
 *
 * AES-256-GCM, a random 96-bit IV per value, and the authentication tag stored alongside, so a ciphertext that
 * has been tampered with fails to decrypt rather than returning something plausible. Node's crypto only — no
 * dependency to audit.
 *
 * The key lives in FIELD_KEY (32 bytes, base64 or hex) and never in the database, so a stolen database dump is
 * not enough on its own. If the key is absent we refuse to encrypt: storing these fields in plain text because
 * the environment was misconfigured is the one outcome worse than not storing them at all.
 *
 * Rotation: FIELD_KEY_OLD is tried on decrypt only. Set the new key as FIELD_KEY, move the previous one to
 * FIELD_KEY_OLD, re-save the affected rows, then drop FIELD_KEY_OLD.
 */
const VERSION = "v1";

function parseKey(raw: string | undefined, name: string): Buffer | null {
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw.trim()) ? Buffer.from(raw.trim(), "hex") : Buffer.from(raw.trim(), "base64");
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes (64 hex characters, or base64 of 32 bytes); got ${buf.length}`);
  return buf;
}

const key = () => parseKey(process.env.FIELD_KEY, "FIELD_KEY");
const oldKey = () => parseKey(process.env.FIELD_KEY_OLD, "FIELD_KEY_OLD");

/** Whether encrypted fields can be written at all. Pages use this to explain themselves instead of erroring. */
export const encryptionReady = () => key() !== null;

export function encryptField(plain: string): string {
  const k = key();
  if (!k) throw new Error("FIELD_KEY is not configured, so this cannot be stored securely.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [VERSION, iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

/** null for anything we cannot authenticate: a wrong key, a truncated value, or a tampered one. */
export function decryptField(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split(".");
  const [version, ivB64, tagB64, bodyB64] = parts;
  // An empty value encrypts to an empty body, so check the shape rather than whether each part is truthy.
  if (parts.length !== 4 || version !== VERSION || !ivB64 || !tagB64 || bodyB64 === undefined) return null;
  for (const k of [key(), oldKey()]) {
    if (!k) continue;
    try {
      const d = createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
      d.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([d.update(Buffer.from(bodyB64, "base64")), d.final()]).toString("utf8");
    } catch {
      // Wrong key or a failed tag check: try the rotation key, then give up.
    }
  }
  return null;
}

export const encryptJson = (value: unknown): string => encryptField(JSON.stringify(value));
export function decryptJson<T>(stored: string | null | undefined): T | null {
  const plain = decryptField(stored);
  if (plain === null) return null;
  try { return JSON.parse(plain) as T; } catch { return null; }
}

/** Equality without leaking timing, for the rare case of comparing a stored value to a supplied one. */
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- UK bank details
export type BankDetails = { accountName: string; sortCode: string; accountNumber: string; iban?: string; swift?: string };

export const normaliseSortCode = (v: string) => v.replace(/[^0-9]/g, "");
export const formatSortCode = (v: string) => {
  const d = normaliseSortCode(v);
  return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}` : d;
};

/** Last four digits, kept in plain text so an admin can confirm an account without anything being decrypted. */
export const last4 = (accountNumber: string) => accountNumber.replace(/[^0-9]/g, "").slice(-4);

export function validateBank(b: { accountName: string; sortCode: string; accountNumber: string; iban?: string; swift?: string }): string | null {
  if (b.accountName.trim().length < 2) return "Give the name on the account.";
  if (b.accountName.trim().length > 140) return "That account name is too long.";
  const sc = normaliseSortCode(b.sortCode);
  const an = b.accountNumber.replace(/[^0-9]/g, "");
  if (sc.length !== 6) return "A UK sort code is six digits, for example 04-00-04.";
  if (an.length !== 8) return "A UK account number is eight digits.";
  if (b.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(b.iban.replace(/\s/g, ""))) return "That IBAN does not look right.";
  if (b.swift && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(b.swift.replace(/\s/g, ""))) return "That SWIFT/BIC does not look right.";
  return null;
}

/** HMRC format: 10 digits, sometimes written with a trailing K or a space. */
export const normaliseUtr = (v: string) => v.replace(/[^0-9]/g, "");
export const validateUtr = (v: string) => (normaliseUtr(v).length === 10 ? null : "A UTR is ten digits.");

/** UK VAT numbers are 9 or 12 digits, optionally prefixed GB. */
export function validateVatNumber(v: string): string | null {
  const s = v.replace(/\s/g, "").toUpperCase().replace(/^GB/, "");
  return /^\d{9}(\d{3})?$/.test(s) ? null : "A UK VAT number is nine digits, sometimes written with GB in front.";
}
export const normaliseVatNumber = (v: string) => {
  const s = v.replace(/\s/g, "").toUpperCase().replace(/^GB/, "");
  return s ? `GB${s}` : "";
};
