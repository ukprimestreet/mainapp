// Encryption of the fields we hold that would hurt someone if they leaked.
import { randomBytes } from "crypto";
import {
  decryptField, decryptJson, encryptField, encryptJson, encryptionReady, formatSortCode, last4,
  normaliseSortCode, normaliseUtr, normaliseVatNumber, sameSecret, validateBank, validateUtr, validateVatNumber,
  type BankDetails,
} from "../src/lib/secretbox";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
const withKeys = <T>(key: string | undefined, old: string | undefined, fn: () => T): T => {
  const [pk, po] = [process.env.FIELD_KEY, process.env.FIELD_KEY_OLD];
  if (key === undefined) delete process.env.FIELD_KEY; else process.env.FIELD_KEY = key;
  if (old === undefined) delete process.env.FIELD_KEY_OLD; else process.env.FIELD_KEY_OLD = old;
  try { return fn(); } finally {
    if (pk === undefined) delete process.env.FIELD_KEY; else process.env.FIELD_KEY = pk;
    if (po === undefined) delete process.env.FIELD_KEY_OLD; else process.env.FIELD_KEY_OLD = po;
  }
};

// ---------------- round trip ----------------
withKeys(KEY_A, undefined, () => {
  t("a value survives a round trip", decryptField(encryptField("40-47-84 / 12345678")) === "40-47-84 / 12345678");
  t("encryption is ready when a key is set", encryptionReady() === true);
  t("the ciphertext does not contain the plaintext", !encryptField("12345678").includes("12345678"));
  t("the same value encrypts differently each time (random IV)", encryptField("same") !== encryptField("same"));
  t("…but both decrypt to the same thing", (() => {
    const a = encryptField("same"), b = encryptField("same");
    return decryptField(a) === "same" && decryptField(b) === "same";
  })());
  t("an empty string round trips", decryptField(encryptField("")) === "");
  t("non-ASCII survives", decryptField(encryptField("Siân O’Brien — £1,250")) === "Siân O’Brien — £1,250");
  t("JSON helpers round trip", (() => {
    const b: BankDetails = { accountName: "S O'Brien", sortCode: "040004", accountNumber: "12345678" };
    return decryptJson<BankDetails>(encryptJson(b))?.accountNumber === "12345678";
  })());
  t("null and undefined decrypt to null", decryptField(null) === null && decryptField(undefined) === null);
  t("garbage decrypts to null rather than throwing", decryptField("not-a-ciphertext") === null);
  t("a value from a future format version is refused", decryptField("v2.aaa.bbb.ccc") === null);
});

// ---------------- tamper detection ----------------
withKeys(KEY_A, undefined, () => {
  const good = encryptField("12345678");
  const [v, iv, tag, body] = good.split(".");
  const flip = (b64: string) => {
    const buf = Buffer.from(b64, "base64");
    buf[0] ^= 0xff;
    return buf.toString("base64");
  };
  t("a tampered body fails to decrypt", decryptField([v, iv, tag, flip(body)].join(".")) === null);
  t("a tampered tag fails to decrypt", decryptField([v, iv, flip(tag), body].join(".")) === null);
  t("a tampered IV fails to decrypt", decryptField([v, flip(iv), tag, body].join(".")) === null);
  t("a truncated value fails to decrypt", decryptField(good.slice(0, good.length - 6)) === null);
});

// ---------------- keys ----------------
t("the wrong key cannot read a value", (() => {
  const c = withKeys(KEY_A, undefined, () => encryptField("secret"));
  return withKeys(KEY_B, undefined, () => decryptField(c)) === null;
})());

t("rotation: the old key still reads values written before it changed", (() => {
  const c = withKeys(KEY_A, undefined, () => encryptField("secret"));
  return withKeys(KEY_B, KEY_A, () => decryptField(c)) === "secret";
})());

t("rotation: new values are written with the NEW key only", (() => {
  const c = withKeys(KEY_B, KEY_A, () => encryptField("fresh"));
  return withKeys(KEY_B, undefined, () => decryptField(c)) === "fresh" && withKeys(KEY_A, undefined, () => decryptField(c)) === null;
})());

// The important one: a missing key must never mean "store it in plain text".
t("without a key, encrypting REFUSES rather than storing plain text", withKeys(undefined, undefined, () => {
  try { encryptField("12345678"); return false; } catch { return true; }
}));
t("without a key, the feature reports itself unavailable", withKeys(undefined, undefined, () => encryptionReady() === false));
t("a key of the wrong length is rejected loudly", withKeys(Buffer.from("too short").toString("base64"), undefined, () => {
  try { encryptionReady(); return false; } catch { return true; }
}));
t("a hex key is accepted as well as base64", withKeys(randomBytes(32).toString("hex"), undefined, () => {
  return decryptField(encryptField("via hex")) === "via hex";
}));

// ---------------- bank detail validation ----------------
t("a valid UK account passes", validateBank({ accountName: "S O'Brien", sortCode: "04-00-04", accountNumber: "12345678" }) === null);
t("a five-digit sort code is rejected", /six digits/.test(validateBank({ accountName: "A B", sortCode: "04000", accountNumber: "12345678" }) ?? ""));
t("a seven-digit account number is rejected", /eight digits/.test(validateBank({ accountName: "A B", sortCode: "040004", accountNumber: "1234567" }) ?? ""));
t("a missing account name is rejected", !!validateBank({ accountName: "", sortCode: "040004", accountNumber: "12345678" }));
t("spaces and dashes in a sort code are fine", validateBank({ accountName: "A B", sortCode: "04 00 04", accountNumber: "1234 5678" }) === null);
t("a bad IBAN is rejected", !!validateBank({ accountName: "A B", sortCode: "040004", accountNumber: "12345678", iban: "nope" }));
t("a good IBAN is accepted", validateBank({ accountName: "A B", sortCode: "040004", accountNumber: "12345678", iban: "GB33BUKB20201555555555" }) === null);
t("sort codes normalise to digits and format back", normaliseSortCode("04-00-04") === "040004" && formatSortCode("040004") === "04-00-04");
t("last4 is taken from the end", last4("12345678") === "5678");

// ---------------- tax references ----------------
t("a ten-digit UTR passes", validateUtr("1234567890") === null);
t("a UTR with a trailing K still passes", validateUtr("1234567890K") === null);
t("a nine-digit UTR is rejected", !!validateUtr("123456789"));
t("UTRs normalise to digits", normaliseUtr("12345 67890K") === "1234567890");
t("a nine-digit VAT number passes, with or without GB", validateVatNumber("123456789") === null && validateVatNumber("GB123456789") === null);
t("a branch-traders VAT number (12 digits) passes", validateVatNumber("123456789012") === null);
t("an eight-digit VAT number is rejected", !!validateVatNumber("12345678"));
t("VAT numbers normalise with a GB prefix", normaliseVatNumber("123 456 789") === "GB123456789");

// ---------------- misc ----------------
t("sameSecret compares equal values as equal", sameSecret("abc", "abc") === true);
t("sameSecret rejects different values and lengths", sameSecret("abc", "abd") === false && sameSecret("abc", "abcd") === false);

console.log(fail === 0 ? "\nALL SECRETBOX TESTS PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
