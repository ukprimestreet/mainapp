import Link from "next/link";
import { getShow } from "@/lib/podcast";
import { ShowForm } from "./ShowForm";

export default async function ShowSettings() {
  const s = await getShow();
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/podcast" className="underline">← Episodes</Link></p>
      <h1 className="mb-2 text-3xl font-extrabold">Show settings</h1>
      <p className="mb-6 max-w-2xl text-grey">These details go into the RSS feed that Apple Podcasts, Spotify and other apps read, and onto the public podcast page.</p>
      <ShowForm initial={{ title: s.title, description: s.description, author: s.author, ownerEmail: s.ownerEmail, imageUrl: s.imageUrl ?? "", language: s.language, category: s.category, explicit: s.explicit, copyright: s.copyright, spotifyUrl: s.spotifyUrl ?? "", appleUrl: s.appleUrl ?? "", youtubeUrl: s.youtubeUrl ?? "" }} />
    </>
  );
}
