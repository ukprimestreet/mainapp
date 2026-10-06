import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { ConfirmButton } from "./ConfirmButton";

export const metadata: Metadata = { title: "Confirm subscription", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Confirm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (<><PageHeader kicker="Newsletter" title="Confirm your subscription" /><Container className="max-w-md py-10"><ConfirmButton token={token} /></Container></>);
}
