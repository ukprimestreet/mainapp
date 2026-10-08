import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Password storage for author accounts. scrypt from Node's own crypto: no dependency, memory-hard, with a
 * per-password salt. The stored string carries its own parameters so they can be raised later without
 * invalidating existing passwords.
 */
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const expected = Buffer.from(hashB64, "base64url");
    const got = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch { return false; }
}

export const MIN_PASSWORD = 10;
const COMMON = new Set([
  "password", "password1", "password123", "qwertyuiop", "1234567890", "letmein123", "iloveyou1",
  "primestreet", "primestreet1", "welcome123", "changeme123", "adminadmin", "qwerty12345",
]);

/**
 * Deliberately plain rules: length does more for security than forced symbols, and a password the author
 * cannot remember gets written on a sticky note.
 */
export function checkPassword(password: string, confirm: string, email?: string): string | null {
  const pw = password ?? "";
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return "That password is too long (200 characters maximum).";
  if (pw !== confirm) return "The two passwords do not match.";
  if (/^\s|\s$/.test(pw)) return "The password cannot start or end with a space.";
  if (new Set(pw).size < 5) return "That password repeats too few characters. Mix it up a little.";
  if (COMMON.has(pw.toLowerCase())) return "That password is too easy to guess. Please choose another.";
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length > 3) {
    return "Your password should not contain your email name.";
  }
  return null;
}
