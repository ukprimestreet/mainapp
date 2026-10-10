"use server";

import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/team-invite";

export async function accept(token: string): Promise<{ message: string }> {
  const r = await acceptInvite(token);
  if (!r.ok) return { message: r.message };
  redirect(`/owner/business/${r.businessId}/insights`);
}
