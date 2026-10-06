import { Hub, hubMetadata } from "@/components/ContentPages";

export const dynamic = "force-dynamic";
export const metadata = hubMetadata("INSIGHT");
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, parseInt((await searchParams).page ?? "1", 10) || 1);
  return <Hub type="INSIGHT" page={page} />;
}
