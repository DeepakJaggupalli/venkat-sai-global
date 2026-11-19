import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { countries, enquiries } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { trackServer } from "@/modules/analytics/server";
import { audit, logSecurityEvent } from "@/modules/audit";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { createPublicRequirementPosterDraft } from "@/modules/content/public-submissions";
import { FileValidationError, storeFile } from "@/modules/files";
import { sniffFileType } from "@/modules/files/mime";
import { consumeSharedUpload } from "@/modules/files/shared-uploads";
import { notifyStaff } from "@/modules/notifications";
import { parseTradeLines } from "@/modules/recruitment-posters/schemas";
import { getSetting } from "@/modules/settings";

import { notifyBusinessInbox } from "./business-inbox";
import type { CvUpload } from "./cv-submissions";
import type { PublicSubmissionMeta } from "./enquiries";
import { enforceRateLimits } from "./internal";
import { findOrCreateInboundLead } from "./leads";
import { staffEnquiryHref } from "./links";
import {
  POSTER_SUBMISSION_MAX_BYTES,
  POSTER_SUBMISSION_MIME_TYPES,
  type PublicPosterSubmissionInput,
  type PublicPosterSubmissionResult,
} from "./requirement-poster-schemas";

/**
 * "Post a requirement" from the public site (/requirements/submit), typically a poster shared from a phone.
 *
 * One transaction: the poster becomes a private media-library image, a `requirement_posts` DRAFT is created and
 * sent to the approval centre marked "Submitted by the public - check before publishing" (content module; the
 * public entry fields carry only country and trades, never contact details), and the contact details are recorded
 * where staff work: an employer enquiry (code ENQ) attached to an employer lead, with a link to the draft. Staff
 * who edit content get an in-app alert; the business inbox gets an email copy with the phone number. Nothing is
 * public until a reviewer approves the publication.
 */

type FieldErrors = Record<string, string[]>;

function invalid(fieldErrors: FieldErrors, message = "Please check the highlighted fields."): never {
  throw new ActionError(message, { fieldErrors });
}

const RASTER: readonly string[] = POSTER_SUBMISSION_MIME_TYPES;

export async function submitPublicRequirementPoster(
  input: PublicPosterSubmissionInput,
  poster: CvUpload | null,
  meta: PublicSubmissionMeta,
): Promise<PublicPosterSubmissionResult> {
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "requirement_poster" } });
    return { code: null, companyName: input.companyName };
  }
  if (!input.consentToContact) invalid({ consentToContact: ["Please agree that we may call or WhatsApp you about this requirement"] });
  const upload = poster && poster.data.byteLength > 0 ? poster : null;
  if (!upload && !input.shared) invalid({ poster: ["Add the poster photo"] });
  if (upload) {
    if (upload.data.byteLength > POSTER_SUBMISSION_MAX_BYTES) invalid({ poster: ["The photo is larger than 4 MB. Choose a smaller photo or a screenshot of the poster."] });
    const sniffed = await sniffFileType(upload.data);
    if (sniffed.kind !== "binary" || !RASTER.includes(sniffed.mime)) invalid({ poster: ["Choose a photo of the poster (JPG, PNG or WebP)."] });
  }

  await enforceRateLimits(
    [
      ...(meta.ipHash
        ? [
            { key: `req-poster:ip:${meta.ipHash}`, limit: 5, windowSeconds: 10 * 60 },
            { key: `req-poster:ip-day:${meta.ipHash}`, limit: 20, windowSeconds: 24 * 60 * 60 },
          ]
        : []),
      { key: `req-poster:phone:${input.phone}`, limit: 3, windowSeconds: 60 * 60 },
    ],
    "You have sent several requirements in a short time. Please wait a little, or send the poster on WhatsApp.",
  );

  let country: { code: string; name: string } | null = null;
  if (input.countryCode) {
    const [row] = await db.select({ code: countries.code, name: countries.name }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
    if (!row) invalid({ countryCode: ["Choose a country from the list"] });
    country = row;
  }
  const trades = parseTradeLines(input.trades);
  const title = `${trades[0]?.trade ?? "New requirement"}${country ? ` - ${country.name}` : ""}`.slice(0, 200);
  const policyVersion = await getSetting("privacy.policy_version");

  try {
    const result = await db.transaction(async (tx) => {
      const code = await nextCode("ENQ", { tx });
      const source = upload
        ? { data: upload.data, name: upload.name || "poster", type: upload.type }
        : await consumeSharedUpload(input.shared!, { purpose: "cms_media", mimeTypes: RASTER }, tx).then(({ file, data }) => ({ data: new Uint8Array(data), name: file.originalName, type: file.mimeType }));
      const posterFile = await storeFile({
        data: source.data,
        originalName: source.name,
        declaredMimeType: source.type,
        purpose: "cms_media",
        ownerUserId: null,
        visibility: "private",
        metadata: { source: "public_requirement", reference: code },
        tx,
      });

      const [enquiry] = await tx
        .insert(enquiries)
        .values({
          code,
          type: "employer",
          name: input.contactName,
          email: input.email ?? null,
          phone: input.phone,
          organizationName: input.companyName,
          subject: `Requirement poster: ${title}`.slice(0, 300),
          message: "Requirement poster submitted on the website.",
          consentToContact: true,
          privacyNoticeVersion: policyVersion,
          sourcePage: "/requirements/submit",
          userId: meta.userId ?? null,
          ipHash: meta.ipHash,
        })
        .returning({ id: enquiries.id });

      const draft = await createPublicRequirementPosterDraft(
        {
          title,
          posterFileId: posterFile.id,
          altText: `Recruitment poster: ${title}`,
          data: { countryCode: country?.code, trades },
          reviewNote: `Call the employer before publishing: contact details are in enquiry ${code} (Command Centre, Leads, Enquiries).`,
        },
        tx,
      );
      const draftHref = CONTENT_ADMIN_PATHS.entry("requirement_posts", draft.entryId);

      const lead = await findOrCreateInboundLead(
        {
          type: "employer",
          source: "website_form",
          sourceDetail: "/requirements/submit",
          name: input.contactName,
          email: input.email ?? null,
          phone: input.phone,
          organizationName: input.companyName,
          countryCode: country?.code ?? null,
          interest: `Requirement poster: ${title}`.slice(0, 300),
          consentToContact: true,
        },
        tx,
      );
      const message = [
        "Requirement poster submitted on the website. It is a DRAFT: nothing is public until it is approved.",
        `Company: ${input.companyName}`,
        country ? `Country: ${country.name}` : null,
        trades.length ? `Trades and salary:\n${trades.map((t) => `- ${t.trade}${t.salary ? ` - ${t.salary}` : ""}`).join("\n")}` : null,
        input.notes ? `Notes: ${input.notes}` : null,
        `Draft poster: ${draftHref} (approval ${draft.approvalCode})`,
      ]
        .filter(Boolean)
        .join("\n\n");
      await tx.update(enquiries).set({ leadId: lead.id, message }).where(eq(enquiries.id, enquiry!.id));

      await audit({
        action: "enquiry.submitted",
        entityType: "enquiry",
        entityId: enquiry!.id,
        metadata: { code, type: "employer", leadId: lead.id, leadCreated: lead.created, cmsEntryId: draft.entryId, approvalId: draft.approvalId, source: "requirement_poster" },
        tx,
      });

      const staffData = { code, type: "employer", senderName: input.contactName, organizationName: input.companyName, subject: `Requirement poster to check before publishing: ${title}` };
      // In-app alert without the phone number; the business inbox copy includes it so the owner can call at once.
      await notifyStaff({ event: "enquiry.received", permission: "content.edit", data: { ...staffData, forStaff: true }, link: draftHref, channels: ["in_app"] }, { tx });
      await notifyBusinessInbox(
        { event: "enquiry.received", data: { ...staffData, subject: `Requirement poster from the website - call ${input.phone} before publishing: ${title}` }, link: staffEnquiryHref(enquiry!.id) },
        tx,
      );
      return { code, companyName: input.companyName };
    });
    await trackServer("requirement_submitted", { formId: "requirement_poster" });
    return result;
  } catch (error) {
    if (error instanceof FileValidationError) invalid({ poster: [error.message] }, error.message);
    if (error instanceof ActionError && error.code === "shared_file_expired") invalid({ poster: ["The shared photo has expired or was already used. Choose the poster photo again."] }, error.message);
    throw error;
  }
}
