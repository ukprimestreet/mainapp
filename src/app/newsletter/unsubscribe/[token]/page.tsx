import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { UnsubButton } from "./UnsubButton";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Unsub({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (<><PageHeader kicker="Newsletter" title="Unsubscribe" /><Container className="max-w-md py-10"><UnsubButton token={token} /></Container></>);
}
