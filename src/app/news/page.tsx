import { Hub, hubMetadata } from "@/components/ContentPages";

export const dynamic = "force-dynamic";
export const metadata = hubMetadata("NEWS");
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, parseInt((await searchParams).page ?? "1", 10) || 1);
  return <Hub type="NEWS" page={page} />;
}
