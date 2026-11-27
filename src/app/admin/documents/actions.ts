"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { audit } from "@/modules/audit";
import { DOCUMENTS_ADMIN_PATH, documentContentSchema, INTERN_STATUSES, INTERNSHIPS_ADMIN_PATH, ISSUED_DOCUMENT_KINDS } from "@/modules/documents/content";
import {
  addIntern,
  addInternsBulk,
  approveDocuments,
  createDocumentByStaff,
  getDocumentSignatory,
  pendingDocumentIdsForProgramme,
  rejectDocument,
  reopenDocument,
  revokeDocument,
  saveDocumentContent,
  setInternStatus,
  updateIntern,
} from "@/modules/documents/service";
import { getFile } from "@/modules/files";
import { requireStaff } from "@/modules/identity/authz";
import { setSetting } from "@/modules/settings";
import { createInternship, setInternshipStatus } from "@/modules/training/internships";
import { internshipSchema } from "@/modules/training/schemas";

const PERMISSION = "training.certificates" as const;

function refresh(...paths: string[]) {
  revalidatePath(DOCUMENTS_ADMIN_PATH, "layout");
  for (const p of paths) revalidatePath(p);
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const saveDocumentAction = createFormAction(
  documentContentSchema.extend({ id: f.uuid(), holderEmail: f.optionalEmail(), holderPhone: f.optionalPhone() }),
  async ({ id, holderEmail, holderPhone, ...content }) => {
    const ctx = await requireStaff(PERMISSION);
    await saveDocumentContent(ctx, { id, content, holderEmail: holderEmail ?? null, holderPhone: holderPhone ?? null });
    refresh(`${DOCUMENTS_ADMIN_PATH}/${id}`);
    return ok(undefined, "Saved. The preview shows your changes.");
  },
);

export const approveDocumentsAction = createAction(z.object({ ids: z.array(z.uuid()).min(1).max(500) }), async ({ ids }) => {
  const ctx = await requireStaff(PERMISSION);
  const { approved, skipped } = await approveDocuments(ctx, ids);
  for (const id of ids.slice(0, 20)) revalidatePath(`${DOCUMENTS_ADMIN_PATH}/${id}`);
  refresh();
  if (!approved) throw new ActionError(skipped ? "Nothing was approved. Open the document and fill in the missing lines first." : "Nothing to approve.");
  return ok(undefined, skipped ? `${approved} approved. ${skipped} need checking first (open them and fill in the missing lines).` : approved === 1 ? "Approved. The person can now download it." : `${approved} approved. Everyone can now download theirs.`);
});

export const rejectDocumentAction = createFormAction(z.object({ id: f.uuid(), reason: f.text({ max: 500, label: "Reason" }) }), async ({ id, reason }) => {
  const ctx = await requireStaff(PERMISSION);
  await rejectDocument(ctx, id, reason);
  refresh(`${DOCUMENTS_ADMIN_PATH}/${id}`);
  return ok(undefined, "Rejected. The person sees the reason.");
});

export const revokeDocumentAction = createFormAction(z.object({ id: f.uuid(), reason: f.text({ max: 500, label: "Reason" }) }), async ({ id, reason }) => {
  const ctx = await requireStaff(PERMISSION);
  await revokeDocument(ctx, id, reason);
  refresh(`${DOCUMENTS_ADMIN_PATH}/${id}`);
  return ok(undefined, "Revoked. The check page now shows it as revoked.");
});

export const reopenDocumentAction = createAction(z.object({ id: f.uuid() }), async ({ id }) => {
  const ctx = await requireStaff(PERMISSION);
  await reopenDocument(ctx, id);
  refresh(`${DOCUMENTS_ADMIN_PATH}/${id}`);
  return ok(undefined, "Reopened. It is waiting for approval again.");
});

export const createDocumentAction = createFormAction(
  z.object({
    kind: f.enumOf(ISSUED_DOCUMENT_KINDS),
    holderName: f.text({ max: 120, label: "Name" }),
    programme: f.text({ max: 160, label: "Course or internship" }),
    role: f.optionalText(120),
    holderEmail: f.optionalEmail(),
    holderPhone: f.optionalPhone(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (input) => {
    const ctx = await requireStaff(PERMISSION);
    const row = await createDocumentByStaff(ctx, { source: "other", ...input });
    refresh();
    return ok({ id: row.id }, "Created. Check the wording, then approve.");
  },
);

export const createInternDocumentAction = createAction(z.object({ participantId: z.uuid(), kind: z.enum(ISSUED_DOCUMENT_KINDS) }), async ({ participantId, kind }) => {
  const ctx = await requireStaff(PERMISSION);
  const row = await createDocumentByStaff(ctx, { source: "intern", participantId, kind });
  refresh();
  return ok({ id: row.id }, "Created. It is waiting for approval.");
});

// ---------------------------------------------------------------------------
// Signature settings
// ---------------------------------------------------------------------------

export const saveSignatoryAction = createFormAction(
  z.object({ name: f.optionalText(80), title: f.text({ max: 80, label: "Title" }), place: f.text({ max: 80, label: "Place" }) }),
  async (input) => {
    const ctx = await requireStaff(PERMISSION);
    const before = await getDocumentSignatory();
    const next = { name: input.name ?? "", title: input.title, place: input.place };
    await setSetting("documents.signatory", next, ctx.user.id);
    await audit({ action: "settings.updated", entityType: "platform_setting", entityId: "documents.signatory", actorUserId: ctx.user.id, metadata: { group: "Certificates and letters", from: before, to: next } });
    refresh();
    return ok(undefined, "Saved. New documents use these details. Documents already made keep theirs (edit them if needed).");
  },
);

export const saveSignatureImageAction = createFormAction(z.object({ fileId: f.optionalUuid(), remove: f.bool().optional() }), async ({ fileId, remove }) => {
  const ctx = await requireStaff(PERMISSION);
  if (remove) {
    await setSetting("documents.signature_file_id", "", ctx.user.id);
    await audit({ action: "settings.updated", entityType: "platform_setting", entityId: "documents.signature_file_id", actorUserId: ctx.user.id, metadata: { removed: true } });
    refresh();
    return ok(undefined, "Signature image removed. Documents print an empty line to sign by hand.");
  }
  if (!fileId) throw new ActionError("Choose the signature image first.", { fieldErrors: { fileId: ["Choose a PNG or JPG image"] } });
  const file = await getFile(fileId);
  if (!file || file.purpose !== "certificate" || (file.mimeType !== "image/png" && file.mimeType !== "image/jpeg")) {
    throw new ActionError("Use a PNG or JPG image of the signature.", { fieldErrors: { fileId: ["Use a PNG or JPG image"] } });
  }
  await setSetting("documents.signature_file_id", file.id, ctx.user.id);
  await audit({ action: "settings.updated", entityType: "platform_setting", entityId: "documents.signature_file_id", actorUserId: ctx.user.id, metadata: { fileId: file.id } });
  refresh();
  return ok(undefined, "Signature saved. It is printed on every certificate and letter.");
});

// ---------------------------------------------------------------------------
// Internship programmes and interns
// ---------------------------------------------------------------------------

export const createProgrammeAction = createFormAction(internshipSchema, async (input) => {
  const ctx = await requireStaff(["training.manage", PERMISSION]);
  const row = await createInternship(ctx, input);
  await setInternshipStatus(ctx, row.id, "open");
  refresh(INTERNSHIPS_ADMIN_PATH);
  return ok({ id: row.id }, "Programme created. Now add the interns.");
});

const internFields = {
  fullName: f.text({ max: 120, label: "Name" }),
  email: f.optionalEmail(),
  phone: f.optionalPhone(),
  institutionName: f.optionalText(200),
  track: f.optionalText(120),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  performanceNote: f.longText(2000),
};

export const addInternAction = createFormAction(z.object({ programmeId: f.uuid(), status: z.enum(["active", "completed"]).default("active"), ...internFields }), async ({ programmeId, status, ...input }) => {
  const ctx = await requireStaff(PERMISSION);
  await addIntern(ctx, programmeId, input, status);
  refresh(`${INTERNSHIPS_ADMIN_PATH}/${programmeId}`);
  return ok(undefined, status === "completed" ? "Added. The certificate and LOR are ready for approval." : "Added. The offer letter is ready for approval.");
});

export const addInternsBulkAction = createFormAction(
  z.object({
    programmeId: f.uuid(),
    lines: f.text({ max: 30_000, label: "Interns" }),
    track: f.optionalText(120),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async ({ programmeId, lines, ...defaults }) => {
    const ctx = await requireStaff(PERMISSION);
    const { added, skipped } = await addInternsBulk(ctx, programmeId, lines, defaults);
    refresh(`${INTERNSHIPS_ADMIN_PATH}/${programmeId}`);
    if (!added) throw new ActionError(skipped.slice(0, 3).join(". ") || "Nobody was added.");
    return ok(undefined, skipped.length ? `${added} added. Not added: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "…" : ""}` : `${added} interns added. Their offer letters are ready for approval.`);
  },
);

export const updateInternAction = createFormAction(z.object({ id: f.uuid(), programmeId: f.uuid(), ...internFields }), async ({ id, programmeId, ...input }) => {
  const ctx = await requireStaff(PERMISSION);
  await updateIntern(ctx, id, input);
  refresh(`${INTERNSHIPS_ADMIN_PATH}/${programmeId}`);
  return ok(undefined, "Saved. Documents already made keep their wording (edit them if needed).");
});

export const setInternStatusAction = createAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500), status: z.enum(INTERN_STATUSES), programmeId: z.uuid() }),
  async ({ ids, status, programmeId }) => {
    const ctx = await requireStaff(PERMISSION);
    const n = await setInternStatus(ctx, ids, status);
    refresh(`${INTERNSHIPS_ADMIN_PATH}/${programmeId}`);
    return ok(undefined, status === "completed" ? `${n} marked finished. Their certificates and LORs are ready for approval.` : `${n} updated.`);
  },
);

export const approveProgrammeDocumentsAction = createAction(z.object({ programmeId: z.uuid() }), async ({ programmeId }) => {
  const ctx = await requireStaff(PERMISSION);
  const ids = await pendingDocumentIdsForProgramme(ctx, programmeId);
  if (!ids.length) throw new ActionError("Nothing is waiting for approval in this programme.");
  const { approved, skipped } = await approveDocuments(ctx, ids);
  refresh(`${INTERNSHIPS_ADMIN_PATH}/${programmeId}`);
  return ok(undefined, skipped ? `${approved} approved, ${skipped} need checking first.` : `${approved} approved. Everyone can now download theirs.`);
});
