import { ArticlePage, articleMetadata } from "@/components/ContentPages";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: P) {
  return articleMetadata("STORY", (await params).slug);
}
export default async function Page({ params }: P) {
  return <ArticlePage type="STORY" slug={(await params).slug} />;
}
