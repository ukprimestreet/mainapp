import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AuthorForm } from "../AuthorForm";

export default async function EditAuthor({ params }: { params: Promise<{ id: string }> }) {
  const a = await db.author.findUnique({ where: { id: (await params).id } });
  if (!a) notFound();
  return (<><h1 className="mb-6 text-3xl font-extrabold">Edit author</h1><AuthorForm initial={{ id: a.id, name: a.name, slug: a.slug, role: a.role ?? "", bio: a.bio ?? "" }} /></>);
}
