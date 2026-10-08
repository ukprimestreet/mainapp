"use client";

import { useCallback, useState } from "react";
import { BlockEditor } from "@/components/BlockEditor";
import { UploadField } from "@/components/UploadField";
import { Notice, Panel, area, btn, field, labelCls } from "@/components/Dash";
import { ARTICLE_TYPES } from "@/lib/constants";
import { blocksToPlainText, type Block } from "@/lib/blocks";
import { MIN_BODY, MIN_STANDFIRST } from "@/lib/editorial-flow";


type A = Record<string, string | null> & { id: string };

/**
 * One screen for writing: the details, the visual editor, and the two actions. Admins see this same screen,
 * so there is only one editing experience to learn and to maintain.
 */
export function ArticleWorkbench({
  article, blocks, locations, canSubmit, submitBlockedReason, saveAction, submitAction, submitLabel = "Send for review", submitHint,
}: {
  article: A; blocks: Block[]; locations: { id: string; name: string; city: string }[];
  canSubmit: boolean; submitBlockedReason: string | null;
  saveAction: (fd: FormData) => Promise<void>;
  submitAction: (fd: FormData) => Promise<void>;
  submitLabel?: string; submitHint?: string;
}) {
  const [title, setTitle] = useState(article.title ?? "");
  const [standfirst, setStandfirst] = useState(article.standfirst ?? "");
  const [disclosure, setDisclosure] = useState(article.disclosure ?? "EDITORIAL");
  const [coverUrl, setCoverUrl] = useState(article.imageUrl ?? "");
  const [live, setLive] = useState<Block[]>(blocks);
  const onBlocks = useCallback((b: Block[]) => setLive(b), []);

  const words = blocksToPlainText(live).split(/\s+/).filter(Boolean).length;
  const chars = blocksToPlainText(live).length;
  const ready = title.trim().length >= 10 && standfirst.trim().length >= MIN_STANDFIRST && chars >= MIN_BODY;

  return (
    <>
      <form action={saveAction} id="article-form">
        <input type="hidden" name="id" value={article.id} />

        <Panel title="The basics">
          <div className="space-y-5">
            <div>
              <label className={labelCls} htmlFor="title">Headline</label>
              <input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="What is this piece about?" />
              <p className="mt-1 text-xs text-grey">{title.trim().length} characters — at least 10 needed to submit.</p>
            </div>
            <div>
              <label className={labelCls} htmlFor="standfirst">Standfirst</label>
              <textarea id="standfirst" name="standfirst" rows={2} value={standfirst} onChange={(e) => setStandfirst(e.target.value)} className={area}
                placeholder="One or two sentences telling the reader why this matters." />
              <p className="mt-1 text-xs text-grey">{standfirst.trim().length} characters — at least {MIN_STANDFIRST} needed.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="type">Section</label>
                <select id="type" name="type" defaultValue={article.type ?? "NEWS"} className={field}>
                  {Object.entries(ARTICLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="locationId">Which area is it about? (optional)</label>
                <select id="locationId" name="locationId" defaultValue={article.locationId ?? ""} className={field}>
                  <option value="">Not area-specific</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.city}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Disclosure" description="Anything paid for must say so, and name who paid.">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="disclosure">Type of content</label>
              <select id="disclosure" name="disclosure" value={disclosure} onChange={(e) => setDisclosure(e.target.value)} className={field}>
                <option value="EDITORIAL">Editorial — independent, nobody paid</option>
                <option value="SPONSORED">Sponsored — paid for by the business featured</option>
                <option value="PARTNER">Partner — made with the business</option>
                <option value="ADVERTORIAL">Advertorial — advertising content</option>
              </select>
            </div>
            {disclosure !== "EDITORIAL" && (
              <div>
                <label className={labelCls} htmlFor="sponsorName">Who paid for it</label>
                <input id="sponsorName" name="sponsorName" defaultValue={article.sponsorName ?? ""} className={field} placeholder="The business or organisation" />
                <p className="mt-1 text-xs text-grey">Required. It is shown on the piece.</p>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Cover image" description="Optional. Shown at the top of the piece and when it is shared.">
          <UploadField name="imageUrl" kind="image" value={coverUrl} onChange={setCoverUrl} label="Cover image" preview />
          {coverUrl && (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="imageAlt">Alt text</label>
                <input id="imageAlt" name="imageAlt" defaultValue={article.imageAlt ?? ""} className={field} placeholder="Describe the picture." />
              </div>
              <div>
                <label className={labelCls} htmlFor="imageCredit">Photo credit</label>
                <input id="imageCredit" name="imageCredit" defaultValue={article.imageCredit ?? ""} className={field} />
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="The piece"
          description="Drag the ⠿ handle to reorder, or use Move up and Move down. Images and buttons can link anywhere."
          action={<span className="text-sm font-bold text-grey">{words} words</span>}
        >
          <BlockEditor name="blocks" initial={blocks} onChange={onBlocks} />
        </Panel>

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t-2 border-line bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
          <button className={btn("ghost")}>Save draft</button>
          <span className="text-sm text-grey">{ready ? "Ready to send for review." : `Needs a headline, a standfirst and at least ${MIN_BODY} characters.`}</span>
        </div>
      </form>

      <form action={submitAction} className="mt-6">
        <input type="hidden" name="id" value={article.id} />
        {!canSubmit && submitBlockedReason && <Notice tone="warn">{submitBlockedReason}</Notice>}
        <button className={btn()} disabled={!canSubmit}>{submitLabel}</button>
        <p className="mt-2 text-sm text-grey">{submitHint ?? "Save your draft first — submitting reviews what is saved."}</p>
      </form>
    </>
  );
}
