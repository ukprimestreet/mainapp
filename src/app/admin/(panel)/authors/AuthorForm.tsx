"use client";
import { useActionState, useState } from "react";
import { saveAuthor, type AuthorState } from "../../article-actions";

const field = "min-h-11 w-full rounded-lg border-2 border-line px-3 py-2";
export function AuthorForm({ initial }: { initial: { id?: string; name: string; slug: string; role: string; bio: string } }) {
  const [state, action, pending] = useActionState<AuthorState, FormData>(saveAuthor, {});
  const [f, setF] = useState(initial);
  const e = state.errors ?? {};
  const row = (id: "name" | "slug" | "role", label: string) => (
    <div><label htmlFor={id} className="mb-1 block font-bold">{label}</label><input id={id} name={id} value={f[id]} onChange={(ev) => setF({ ...f, [id]: ev.target.value })} className={field} aria-invalid={!!e[id]} />{e[id] && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e[id]}</p>}</div>
  );
  return (
    <form action={action} className="max-w-xl space-y-4">
      {f.id && <input type="hidden" name="id" value={f.id} />}
      {row("name", "Name")}{row("slug", "URL slug (blank = from name)")}{row("role", "Role")}
      <div><label htmlFor="bio" className="mb-1 block font-bold">Bio ({f.bio.length}/600)</label><textarea id="bio" name="bio" rows={4} value={f.bio} onChange={(ev) => setF({ ...f, bio: ev.target.value })} className={field} />{e.bio && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {e.bio}</p>}</div>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink px-8 font-bold text-yellow">Save author</button>
    </form>
  );
}
