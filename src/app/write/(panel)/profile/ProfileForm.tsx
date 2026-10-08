"use client";

import { useActionState, useState } from "react";
import { saveAuthorProfile, type FormState } from "../../actions";
import { Chip, Panel, area, btn, field, labelCls } from "@/components/Dash";
import { SOCIALS, SOCIAL_KEYS, type SocialKey } from "@/lib/authors";
import { MIN_BIO_CHARS, MIN_EXPERIENCE_CHARS, parseList, type Check } from "@/lib/author-profile";
import { UploadField } from "@/components/UploadField";

type Me = Record<string, string | null> & { id: string; name: string };

export function ProfileForm({ me, checks }: { me: Me; checks: Check[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAuthorProfile, {});
  const [imageUrl, setImageUrl] = useState(me.imageUrl ?? "");
  const [cvUrl, setCvUrl] = useState(me.cvUrl ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [exp, setExp] = useState(me.experience ?? "");
  const err = (k: string) => state.errors?.[k];
  const done = (k: string) => checks.find((c) => c.key === k)?.done;
  const Mark = ({ k }: { k: string }) => done(k) ? null : <span className="ml-2 align-middle"><Chip tone="draft">needed</Chip></span>;

  return (
    <form action={action} className="space-y-0">
      {state.error && <p role="alert" className="mb-6 rounded-2xl border-2 border-red-700 p-4 font-bold text-red-800">{state.error}</p>}
      {state.ok && <p className="mb-6 rounded-2xl border-2 border-ink bg-yellow-soft p-4 font-bold">{state.ok}</p>}

      <Panel title="Who you are" description="Shown on your byline and public profile.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="name">Full name<Mark k="name" /></label>
            <input id="name" name="name" defaultValue={me.name} required className={field} />
            {err("name") && <p className="mt-1 text-sm font-bold text-red-800">{err("name")}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="role">Job title<Mark k="role" /></label>
            <input id="role" name="role" defaultValue={me.role ?? ""} placeholder="Reporter" className={field} />
            {err("role") && <p className="mt-1 text-sm font-bold text-red-800">{err("role")}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="email-shown">Email address<Mark k="email" /></label>
            <input id="email-shown" value={me.email ?? ""} readOnly className={`${field} bg-mist`} />
            <p className="mt-1 text-xs text-grey">Your sign-in address. Ask an editor if it needs changing.</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="phone">Phone number<Mark k="phone" /></label>
            <input id="phone" name="phone" defaultValue={me.phone ?? ""} inputMode="tel" placeholder="020 7946 0000" className={field} />
            <p className="mt-1 text-xs text-grey">Never published. Used only when an editor needs you quickly.</p>
            {err("phone") && <p className="mt-1 text-sm font-bold text-red-800">{err("phone")}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="basedIn">Where you are based<Mark k="basedIn" /></label>
            <input id="basedIn" name="basedIn" defaultValue={me.basedIn ?? ""} placeholder="Hackney, London" className={field} />
            {err("basedIn") && <p className="mt-1 text-sm font-bold text-red-800">{err("basedIn")}</p>}
          </div>
        </div>
      </Panel>

      <Panel title="Portrait" description="Appears beside your name on every article you write.">
        <UploadField name="imageUrl" kind="image" value={imageUrl} onChange={setImageUrl} label="Portrait photo" needed={!done("imageUrl")} preview />
        {err("imageUrl") && <p className="mt-1 text-sm font-bold text-red-800">{err("imageUrl")}</p>}
      </Panel>

      <Panel title="About you" description="Readers use this to decide whether to trust the piece.">
        <label className={labelCls} htmlFor="bio">Biography<Mark k="bio" /></label>
        <textarea id="bio" name="bio" rows={5} value={bio} onChange={(e) => setBio(e.target.value)} className={area}
          placeholder="What you write about, and why readers should trust you on it." />
        <p className="mt-1 text-xs text-grey">{bio.trim().length} characters — at least {MIN_BIO_CHARS} needed.</p>
        {err("bio") && <p className="mt-1 text-sm font-bold text-red-800">{err("bio")}</p>}

        <div className="mt-6">
          <label className={labelCls} htmlFor="experience">Past experience<Mark k="experience" /></label>
          <textarea id="experience" name="experience" rows={5} value={exp} onChange={(e) => setExp(e.target.value)} className={area}
            placeholder="Where you have written or worked before, and for how long." />
          <p className="mt-1 text-xs text-grey">{exp.trim().length} characters — at least {MIN_EXPERIENCE_CHARS} needed. Not published; it is for the editors.</p>
          {err("experience") && <p className="mt-1 text-sm font-bold text-red-800">{err("experience")}</p>}
        </div>

        <div className="mt-6">
          <label className={labelCls} htmlFor="expertise">Subjects you cover<Mark k="expertise" /></label>
          <input id="expertise" name="expertise" defaultValue={parseList(me.expertise).join(", ")} className={field}
            placeholder="Retail, hospitality, planning, commercial property" />
          <p className="mt-1 text-xs text-grey">Comma separated, up to 8. Editors use these when commissioning.</p>
          {err("expertise") && <p className="mt-1 text-sm font-bold text-red-800">{err("expertise")}</p>}
        </div>
      </Panel>

      <Panel title="CV" description="Not published. Editors read it once, when you join.">
        <UploadField name="cvUrl" kind="doc" value={cvUrl} onChange={setCvUrl} label="CV or résumé" needed={!done("cvUrl")} />
        {err("cvUrl") && <p className="mt-1 text-sm font-bold text-red-800">{err("cvUrl")}</p>}
      </Panel>

      <Panel title="Published work elsewhere" description="Links to pieces you have written for other outlets.">
        <label className={labelCls} htmlFor="portfolio">Links<Mark k="portfolio" /></label>
        <textarea id="portfolio" name="portfolio" rows={4} defaultValue={parseList(me.portfolio).join("\n")} className={area}
          placeholder={"https://example.com/your-article\nhttps://another.com/your-piece"} />
        <p className="mt-1 text-xs text-grey">One https link per line, up to 8.</p>
        {err("portfolio") && <p className="mt-1 text-sm font-bold text-red-800">{err("portfolio")}</p>}
      </Panel>

      <Panel title="Social links" description="Only the ones you fill in appear on your profile — leave the rest blank.">
        <p className="mb-4 text-sm text-grey">
          Paste a full link, or just your handle. At least one is needed.{!done("socials") && <span className="ml-2 align-middle"><Chip tone="draft">needed</Chip></span>}
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {SOCIAL_KEYS.map((k: SocialKey) => (
            <div key={k}>
              <label className={labelCls} htmlFor={k}>{SOCIALS[k].label}</label>
              <input id={k} name={k} defaultValue={me[k] ?? ""} className={field}
                placeholder={SOCIALS[k].handle ? `@yourname or ${SOCIALS[k].handle}yourname` : "https://…"} />
              {err(k) && <p className="mt-1 text-sm font-bold text-red-800">{err(k)}</p>}
            </div>
          ))}
        </div>
      </Panel>

      <div className="sticky bottom-0 -mx-4 border-t-2 border-line bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <button className={btn()} disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
      </div>
    </form>
  );
}
