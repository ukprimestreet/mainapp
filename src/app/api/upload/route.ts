import { NextResponse } from "next/server";
import { getAuthorSession } from "@/lib/author-auth";
import { isAdmin } from "@/lib/auth";
import { BUCKETS, checkFile, storageConfigured, storagePath, upload, type Bucket } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Uploads a portrait or a CV. Signed-in authors and admins only — the bucket is chosen here, never by the
 * browser, so a caller cannot aim an image upload at the private document bucket or vice versa.
 */
export async function POST(req: Request) {
  const author = await getAuthorSession();
  const admin = await isAdmin();
  if (!author && !admin) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!storageConfigured()) return NextResponse.json({ error: "File storage is not configured yet." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "image");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was attached." }, { status: 400 });

  const bucket: Bucket = kind === "doc" ? "author-docs" : "author-media";
  const type = file.type || "application/octet-stream";
  const problem = checkFile(bucket, type, file.size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const ownerId = author?.id ?? "admin";
  try {
    const url = await upload(bucket, storagePath(ownerId, type, kind === "doc" ? "cv-" : ""), await file.arrayBuffer(), type);
    return NextResponse.json({ url, public: BUCKETS[bucket].public });
  } catch (e) {
    return NextResponse.json({ error: "The upload failed. Try again in a moment." }, { status: 502 });
  }
}

export function GET() { return NextResponse.json({ error: "Method not allowed" }, { status: 405 }); }
