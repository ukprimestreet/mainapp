import { notFound } from "next/navigation";
import { ArticleEditor } from "../ArticleEditor";
import { editorProps } from "../form-data";

export default async function NewArticle({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const p = await editorProps(undefined, (await searchParams).type);
  if (!p) notFound();
  return (<><h1 className="mb-6 text-3xl font-extrabold">New article</h1><ArticleEditor {...p} /></>);
}
