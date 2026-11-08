import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { sp as pick, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { defaultPosterTitle, getDraftPosterUpload, POSTER_PERMISSIONS } from "@/modules/recruitment-posters/service";
import { countryOptions } from "@/modules/taxonomy/queries";

import { PosterPublishForm } from "../_components/poster-publish-form";

export const metadata: Metadata = { title: "Post requirement" };

/**
 * Phone-first "Post requirement" page: choose the poster photo, optionally add details, publish in one tap.
 * `?file=<id>` prefills an image shared to the installed app (Web Share Target, see ../share/route.ts).
 */
export default async function NewPosterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff([...POSTER_PERMISSIONS]);
  const sp = await searchParams;
  const fileId = pick(sp, "file");
  const shareError = pick(sp, "share_error");
  const [draft, countries] = await Promise.all([
    fileId && /^[0-9a-f-]{36}$/i.test(fileId) ? getDraftPosterUpload(ctx, fileId) : Promise.resolve(null),
    countryOptions(),
  ]);
  const canPublish = staffCan(ctx, "content.publish");

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader
        title="Post requirement"
        description="Choose the poster from your gallery (or take a photo) and publish it to Latest requirements on the website."
        backLink={{ href: "/admin/requirements/posters", label: "All posters" }}
      />
      {!canPublish ? (
        <Callout tone="info" title="Your posts need approval">
          You can post requirements, but publishing needs a content publisher. Your poster is sent to the{" "}
          <Link href="/admin/approvals" className="font-medium underline underline-offset-4">
            approval centre
          </Link>{" "}
          and appears on the website once it is approved.
        </Callout>
      ) : null}
      {shareError ? (
        <Callout tone="warning" title="The shared image could not be used">
          {shareError === "type" ? "Only JPG, PNG or WebP images can be posted. Choose the poster below instead." : "Choose the poster below instead."}
        </Callout>
      ) : null}
      <PosterPublishForm
        countries={countries}
        defaultTitle={defaultPosterTitle()}
        canPublish={canPublish}
        draft={draft ? { id: draft.id, previewUrl: draft.previewUrl, name: draft.name } : null}
        sharedTitle={draft?.sharedTitle ?? null}
        sharedText={draft?.sharedText ?? null}
      />
    </div>
  );
}
