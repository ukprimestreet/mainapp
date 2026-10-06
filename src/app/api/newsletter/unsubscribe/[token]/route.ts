import { db } from "@/lib/db";
import { readUnsubToken } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

/** RFC 8058 one-click unsubscribe target (List-Unsubscribe-Post). Mail clients POST here; the token is an HMAC of the subscriber id. */
export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = readUnsubToken((await params).token);
  if (!id) return new Response("Invalid", { status: 400 });
  await db.newsletterSubscriber.updateMany({ where: { id }, data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() } });
  return new Response("Unsubscribed", { status: 200 });
}
