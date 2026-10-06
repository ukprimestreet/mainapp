import { AuthorForm } from "../AuthorForm";

export default function NewAuthor() {
  return (<><h1 className="mb-6 text-3xl font-extrabold">New author</h1><AuthorForm initial={{ name: "", slug: "", role: "", bio: "" }} /></>);
}
