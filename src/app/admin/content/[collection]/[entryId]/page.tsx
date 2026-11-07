import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import type { CmsCollection } from "@/db/schema";
import { requireStaff } from "@/modules/identity/authz";
import { getCollection, isCmsCollection } from "@/modules/content/collections";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { getEntryDetail } from "@/modules/content/queries";

import { loadEditorData } from "../../_lib/editor-data";
import { EntryEditorView } from "../../_lib/entry-view";

type Params = Promise<{ collection: string; entryId: string }>;

const uuid = z.uuid();

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { collection } = await params;
  return { title: isCmsCollection(collection) ? `Edit ${getCollection(collection).singularLabel.toLowerCase()}` : "Edit content" };
}

export default async function EntryPage({ params }: { params: Params }) {
  const ctx = await requireStaff("content.view");
  const { collection, entryId } = await params;
  if (!isCmsCollection(collection) || !uuid.safeParse(entryId).success) notFound();
  const detail = await getEntryDetail(ctx, entryId);
  if (!detail) notFound();
  // Links built with the wrong collection (renamed or moved content) land on the right editor.
  if (detail.entry.collection !== collection) redirect(CONTENT_ADMIN_PATHS.entry(detail.entry.collection as CmsCollection, entryId));

  const def = getCollection(collection);
  const data = await loadEditorData(ctx, detail);
  return (
    <EntryEditorView
      data={data}
      title={data.latest.title || `Untitled ${def.singularLabel.toLowerCase()}`}
      breadcrumbs={[
        { label: "Command Centre", href: "/admin" },
        { label: "Content", href: CONTENT_ADMIN_PATHS.content },
        { label: def.label, href: CONTENT_ADMIN_PATHS.collection(collection) },
        { label: data.latest.title || "Untitled" },
      ]}
    />
  );
}
