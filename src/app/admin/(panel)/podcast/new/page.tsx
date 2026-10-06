import { EpisodeEditor } from "../EpisodeEditor";
import { episodeProps } from "../form-data";

export default async function NewEpisode() {
  const p = (await episodeProps())!;
  return (<><h1 className="mb-6 text-3xl font-extrabold">New episode</h1><EpisodeEditor initial={p.initial} articles={p.articles} /></>);
}
