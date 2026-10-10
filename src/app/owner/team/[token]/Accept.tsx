"use client";

import { useActionState } from "react";
import { btn } from "@/components/Dash";
import { accept } from "./actions";

/**
 * A POST button rather than a link that acts on load: email clients and link scanners fetch URLs, and a
 * single-use invitation must not be burned by a scanner before the person has clicked anything.
 */
export function Accept({ token, business }: { token: string; business: string }) {
  const [state, action, pending] = useActionState(async () => accept(token), { message: "" });
  return (
    <form action={action}>
      <button className={btn()} disabled={pending}>
        {pending ? "Setting you up…" : `Accept and manage ${business}`}
      </button>
      {state.message && <p role="alert" className="mt-4 font-bold text-red-800">{state.message}</p>}
    </form>
  );
}
