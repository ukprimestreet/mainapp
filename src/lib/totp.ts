import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Time-based one-time passwords (RFC 6238), for administrator accounts that move money.
 *
 * Node crypto only — no dependency to audit for something this security-sensitive. Compatible with Google
 * Authenticator, 1Password, Authy and anything else that reads an `otpauth://` URI.
 *
 * Deliberately no QR-code library: the provisioning URI and the secret in groups of four are enough to add
 * an account by hand, and a QR encoder is a lot of surface area for a convenience.
 */

const DIGITS = 6;
const PERIOD = 30; // seconds
/** One step either side, so a slightly wrong clock does not lock someone out. */
const DRIFT = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i === -1) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** 20 bytes, which is what RFC 4226 recommends for HMAC-SHA1. */
export const generateSecret = () => base32Encode(randomBytes(20));

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac("sha1", secret).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The code for a moment in time. Exposed so tests do not have to wait 30 seconds. */
export const totpAt = (secretBase32: string, atMs: number): string =>
  hotp(base32Decode(secretBase32), Math.floor(atMs / 1000 / PERIOD));

/**
 * Checks a submitted code, allowing one step of drift either side.
 *
 * The comparison is constant-time, and a malformed code is rejected before any work is done so that the
 * shape of the input cannot be learned from how long the answer takes.
 */
export function verifyTotp(secretBase32: string, code: string, atMs = Date.now()): boolean {
  const clean = (code ?? "").replace(/\D/g, "");
  if (clean.length !== DIGITS || !secretBase32) return false;
  const step = Math.floor(atMs / 1000 / PERIOD);
  const secret = base32Decode(secretBase32);
  let hit = false;
  // Every candidate is evaluated rather than returning on the first match, so timing says nothing about
  // which step matched.
  for (let d = -DRIFT; d <= DRIFT; d++) {
    const expected = hotp(secret, step + d);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) hit = true;
  }
  return hit;
}

/** The URI an authenticator app reads. The label is what the person sees in their app. */
export function provisioningUri(secretBase32: string, accountEmail: string, issuer = "PrimeStreet"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** The secret in groups of four, for typing in by hand. */
export const formatSecret = (secretBase32: string) => secretBase32.match(/.{1,4}/g)?.join(" ") ?? secretBase32;
