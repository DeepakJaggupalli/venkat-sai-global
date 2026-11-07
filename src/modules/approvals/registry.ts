import "server-only";

import type { PlatformPermission } from "@/config/permissions";
import type { ApprovalType } from "@/db/schema";
import { approvalHandlers as candidates } from "@/modules/candidates/approval-handlers";
import { approvalHandlers as commercial } from "@/modules/commercial/approval-handlers";
import { approvalHandlers as content } from "@/modules/content/approval-handlers";
import { approvalHandlers as jobs } from "@/modules/jobs/approval-handlers";
import { approvalHandlers as operations } from "@/modules/operations/approval-handlers";
import { approvalHandlers as organizations } from "@/modules/organizations/approval-handlers";
import { approvalHandlers as training } from "@/modules/training/approval-handlers";

import type { ApprovalHandlers } from "./types";

export const approvalHandlers: ApprovalHandlers = {
  ...organizations,
  ...jobs,
  ...candidates,
  ...training,
  ...content,
  ...commercial,
  ...operations,
};

/** Extra permission required (on top of approvals.decide) to decide each approval type. */
export const APPROVAL_TYPE_PERMISSION: Record<ApprovalType, PlatformPermission> = {
  employer_verification: "orgs.verify",
  partner_verification: "orgs.verify",
  institution_verification: "orgs.verify",
  job_publication: "jobs.approve",
  candidate_document: "candidates.verify",
  candidate_credential: "candidates.verify",
  course_publication: "training.manage",
  testimonial: "content.publish",
  case_study: "content.publish",
  partner_announcement: "content.publish",
  media_asset: "content.publish",
  content_publication: "content.publish",
  refund: "commercial.refunds",
  subscription_exception: "commercial.refunds",
  partner_settlement: "partners.settlements",
  requirement_request: "requirements.manage",
};

export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  employer_verification: "Employer verification",
  partner_verification: "Recruitment partner verification",
  institution_verification: "Institution verification",
  job_publication: "Job publication",
  candidate_document: "Candidate document",
  candidate_credential: "Candidate credential",
  course_publication: "Course publication",
  testimonial: "Testimonial",
  case_study: "Case study",
  partner_announcement: "Partner announcement",
  media_asset: "Media asset",
  content_publication: "Content publication",
  refund: "Refund",
  subscription_exception: "Subscription exception",
  partner_settlement: "Partner settlement",
  requirement_request: "Workforce requirement",
};
