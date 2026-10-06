import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirectIfMoved } from "@/lib/redirects";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Lowest-priority route: only URLs that match nothing else land here. If the Redirect manager knows the old URL we send a
 * permanent redirect; otherwise a genuine 404. (Dynamic routes with their own lookups call redirectIfMoved() themselves.)
 */
export default async function Missing({ params }: { params: Promise<{ missing: string[] }> }) {
  const { missing } = await params;
  await redirectIfMoved("/" + missing.join("/"));
  notFound();
}
