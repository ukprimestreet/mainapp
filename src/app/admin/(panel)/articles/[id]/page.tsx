import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteArticle } from "../../../article-actions";
import { ArticleEditor } from "../ArticleEditor";
import { editorProps } from "../form-data";

export default async function EditArticle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const p = await editorProps(id);
  if (!p) notFound();
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/articles" className="underline">← All articles</Link></p>
      <h1 className="mb-4 text-3xl font-extrabold">Edit article</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{msg}</p>}
      <ArticleEditor key={p.initial.id + p.initial.status + p.initial.publishedAt} {...p} />
      <form action={deleteArticle} className="mt-12 border-t border-line pt-6"><input type="hidden" name="id" value={id} />
        <button className="font-bold text-red-700 underline">Delete this article</button> <span className="text-sm text-grey">(only drafts and sample articles can be deleted)</span></form>
    </>
  );
}
