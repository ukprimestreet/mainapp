import Link from "next/link";
import { Card, Notice, PageHead, btn } from "@/components/Dash";
import { requireBusiness } from "@/lib/owner";
import { MAX_GALLERY, getEntitlements, parseGallery } from "@/lib/commerce";
import { saveGallery } from "../../../../business-actions";
import { PhotoManager } from "./PhotoManager";

export const dynamic = "force-dynamic";

export default async function Photos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params; const { msg } = await searchParams;
  const { business } = await requireBusiness(id);
  const ent = await getEntitlements(id);
  const photos = parseGallery(business.gallery);

  return (
    <>
      <PageHead
        title="Photos"
        subtitle="Photos are the single biggest difference on a profile. People scroll past listings with nothing to look at."
        back={{ href: `/owner/business/${id}`, label: business.name }}
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      {!ent.premium ? (
        <Card title="A photo gallery is part of Premium">
          <p className="text-[15px] text-grey">
            You can set one cover image on the free profile. Premium adds a gallery of up to {MAX_GALLERY} photos,
            an offer banner and an enquiry form.
          </p>
          <Link href={`/owner/business/${id}/promote`} className={`${btn()} mt-4`}>See what Premium costs</Link>
          <p className="mt-3 text-[13px] text-grey">It never changes your rating, your reviews or where you appear in search.</p>
        </Card>
      ) : (
        <Card title="Your gallery" description="Drag to reorder, or use the arrows. The first photo is the one most people see.">
          <form action={saveGallery}>
            <input type="hidden" name="businessId" value={id} />
            <PhotoManager initial={photos} max={MAX_GALLERY} />
          </form>
        </Card>
      )}

      <Card title="What makes a good photo here">
        <ul className="space-y-2.5 text-[15px]">
          <li><strong>Show the actual place.</strong> The front of the shop, the room people sit in, the van outside the job.</li>
          <li><strong>Daylight beats a flash.</strong> Phone cameras are fine; bad lighting is not.</li>
          <li><strong>Show people working</strong> if they are happy to be photographed. It reads as real.</li>
          <li><strong>Skip the stock photos.</strong> Readers spot them instantly and trust the listing less.</li>
          <li><strong>Only use photos you own</strong> or have permission to use.</li>
        </ul>
      </Card>
    </>
  );
}
