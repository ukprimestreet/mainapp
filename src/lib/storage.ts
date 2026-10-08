import { randomBytes } from "crypto";

/**
 * Supabase Storage over its REST API — no SDK, and the service-role key never leaves the server.
 *
 * Two buckets, deliberately different:
 *  - author-media / business-media are public: portraits and photos are published.
 *  - author-docs is private: a CV is given to the editors, not to the internet. Those files are stored as
 *    "storage:author-docs/<path>" and only ever handed out as a short-lived signed URL to an admin.
 */
export const BUCKETS = {
  "author-media": { public: true, max: 5 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] },
  "author-docs": { public: false, max: 10 * 1024 * 1024, types: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  "business-media": { public: true, max: 5 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] },
} as const;
export type Bucket = keyof typeof BUCKETS;

const base = () => {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  return url.replace(/\/$/, "");
};
const key = () => {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return k;
};
export const storageConfigured = () => !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** A path that cannot be guessed or traversed: the owner's id, a random segment and a safe extension. */
export function storagePath(ownerId: string, contentType: string, prefix = "") {
  const safeOwner = ownerId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "unknown";
  const ext = EXT[contentType] ?? "bin";
  return `${safeOwner}/${prefix}${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
}

export const publicUrl = (bucket: Bucket, path: string) => `${base()}/storage/v1/object/public/${bucket}/${path}`;
export const storageRef = (bucket: Bucket, path: string) => `storage:${bucket}/${path}`;

export function parseStorageRef(value: string | null | undefined): { bucket: Bucket; path: string } | null {
  if (!value?.startsWith("storage:")) return null;
  const rest = value.slice("storage:".length);
  const slash = rest.indexOf("/");
  if (slash < 1) return null;
  const bucket = rest.slice(0, slash) as Bucket;
  const path = rest.slice(slash + 1);
  return bucket in BUCKETS && path && !path.includes("..") ? { bucket, path } : null;
}

export async function upload(bucket: Bucket, path: string, body: ArrayBuffer, contentType: string) {
  const r = await fetch(`${base()}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, apikey: key(), "content-type": contentType, "x-upsert": "true", "cache-control": "max-age=31536000" },
    body,
  });
  if (!r.ok) throw new Error(`Storage upload failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return BUCKETS[bucket].public ? publicUrl(bucket, path) : storageRef(bucket, path);
}

/** Short-lived link to a private file, for an admin reading a CV. */
export async function signedUrl(value: string, seconds = 300): Promise<string | null> {
  const ref = parseStorageRef(value);
  if (!ref) return /^https:\/\//i.test(value) ? value : null;
  const r = await fetch(`${base()}/storage/v1/object/sign/${ref.bucket}/${encodeURI(ref.path)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, apikey: key(), "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { signedURL?: string };
  return j.signedURL ? `${base()}/storage/v1${j.signedURL}` : null;
}

export async function removeObject(value: string) {
  const ref = parseStorageRef(value);
  if (!ref) return false;
  const r = await fetch(`${base()}/storage/v1/object/${ref.bucket}/${encodeURI(ref.path)}`, {
    method: "DELETE", headers: { authorization: `Bearer ${key()}`, apikey: key() },
  });
  return r.ok;
}

/** Validates an incoming file against the bucket's rules. Returns an error message, or null when acceptable. */
export function checkFile(bucket: Bucket, type: string, size: number): string | null {
  const b = BUCKETS[bucket];
  if (!b.types.includes(type as never)) {
    const names = b.public ? "a JPEG, PNG or WebP image" : "a PDF or Word document";
    return `That file type isn't supported — upload ${names}.`;
  }
  if (size > b.max) return `That file is too large. The limit is ${Math.round(b.max / (1024 * 1024))}MB.`;
  if (size < 64) return "That file looks empty.";
  return null;
}
