"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FileUpload } from "@/components/files";
import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import { SkillPicker } from "@/components/shared/skill-picker";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/modules/analytics/client";
import type { FileSummary } from "@/modules/files/types";
import { createCourseAction, updateCourseAction } from "@/modules/training/actions";
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  COURSE_CERTIFICATION_TYPE_LABELS,
  COURSE_FEE_TYPE_LABELS,
  COURSE_FEE_TYPES,
  COURSE_MODE_LABELS,
  COURSE_MODES,
} from "@/modules/training/constants";

import { eitherFormAction, useInstitutionForm } from "./use-form-action";

export type CourseFormDefaults = {
  title?: string;
  summary?: string | null;
  descriptionHtml?: string | null;
  category?: string;
  skills?: SelectOption[];
  mode?: string;
  durationHours?: number | null;
  durationWeeks?: number | null;
  eligibility?: string | null;
  prerequisites?: string | null;
  outcomes?: string[];
  feeType?: string;
  feeAmount?: number | null;
  feeCurrency?: string | null;
  feeNotes?: string | null;
  languages?: SelectOption[];
  certificationType?: string;
  accreditationBody?: string | null;
  cover?: FileSummary | null;
};

const LABELS = {
  title: "Course title",
  summary: "Summary",
  descriptionHtml: "Description",
  category: "Category",
  skillIds: "Skills taught",
  mode: "Delivery",
  durationHours: "Duration (hours)",
  durationWeeks: "Duration (weeks)",
  eligibility: "Eligibility",
  prerequisites: "Prerequisites",
  outcomes: "Learning outcomes",
  feeType: "Fee",
  feeAmount: "Fee amount",
  feeCurrency: "Currency",
  feeNotes: "Fee notes",
  languageCodes: "Languages of instruction",
  certificationType: "What learners can earn",
  accreditationBody: "External awarding body",
  coverFileId: "Cover image",
};

/** Plain-language rules shown next to the certification choice (the training service enforces them). */
const CERTIFICATION_RULES: Record<string, string> = {
  completion_only: "You issue a certificate of completion to learners who complete a batch. It states that your institution issued it.",
  accredited_external:
    "An accredited certificate issued under an external awarding body (named below). Only institutions that Venkat Sai has authorised as certificate issuers can publish such courses and issue these certificates, and only to learners who pass.",
  venkat_sai_assessment:
    "Learners can take a Venkat Sai assessment. Venkat Sai assessment certificates are issued by Venkat Sai only, after its own assessment, and are not an external accreditation. You can still issue certificates of completion.",
  none: "No certificate is issued for this course.",
};

const categoryOptions = COURSE_CATEGORIES.map((c) => ({ value: c, label: COURSE_CATEGORY_LABELS[c] }));
const modeOptions = COURSE_MODES.map((m) => ({ value: m, label: COURSE_MODE_LABELS[m] }));
const feeOptions = COURSE_FEE_TYPES.map((f) => ({ value: f, label: COURSE_FEE_TYPE_LABELS[f] }));

export function CourseForm({
  courseId,
  organizationId,
  defaults = {},
  currencies,
  languages,
  authorisedIssuer,
  published,
}: {
  courseId?: string;
  organizationId: string;
  defaults?: CourseFormDefaults;
  currencies: SelectOption[];
  languages: SelectOption[];
  authorisedIssuer: boolean;
  published?: boolean;
}) {
  const router = useRouter();
  const { state, pending, onSubmit } = useInstitutionForm(eitherFormAction(updateCourseAction, createCourseAction, Boolean(courseId)));
  const [feeType, setFeeType] = useState(defaults.feeType ?? "on_request");
  const [certification, setCertification] = useState(defaults.certificationType ?? "completion_only");
  const [uploading, setUploading] = useState(false);
  const started = useRef(false);
  const formId = courseId ? "institution_course_edit" : "institution_course_create";
  useActionToast(state);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      const created = state.data as { id?: string } | undefined;
      router.push(`/institution/courses/${courseId ?? created?.id ?? ""}`);
    } else track("error_shown", { formId });
  }, [state, courseId, router, formId]);

  const certificationOptions = Object.entries(COURSE_CERTIFICATION_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <form
      onSubmit={(e) => {
        track("form_submitted", { formId });
        onSubmit(e);
      }}
      onFocus={() => {
        if (!started.current) {
          started.current = true;
          track("form_started", { formId });
        }
      }}
      noValidate
      className="space-y-8"
    >
      {courseId ? <input type="hidden" name="courseId" value={courseId} /> : null}
      <FormErrorAlert state={state} fieldLabels={LABELS} />
      {published ? (
        <Callout tone="warning" title="Saving sends this course back to review">
          It is hidden from the catalogue until Venkat Sai approves the changes. Existing batches and enrolments continue.
        </Callout>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">About the course</legend>
        <FormField label={LABELS.title} name="title" required state={state}>
          <Input maxLength={200} defaultValue={defaults.title} />
        </FormField>
        <FormField label={LABELS.summary} name="summary" optional state={state} hint="One or two sentences for listings (up to 500 characters).">
          <Textarea rows={2} maxLength={500} defaultValue={defaults.summary ?? undefined} />
        </FormField>
        <FormField label={LABELS.descriptionHtml} name="descriptionHtml" optional state={state} hint="What learners will do and how the course is taught.">
          {(field) => <RichTextEditor {...field} name="descriptionHtml" defaultValue={defaults.descriptionHtml} maxLength={50_000} minHeight="md" />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={LABELS.category} name="category" required state={state}>
            <SimpleSelect options={categoryOptions} defaultValue={defaults.category} placeholder="Choose a category" />
          </FormField>
          <FormField label={LABELS.mode} name="mode" required state={state}>
            <SimpleSelect options={modeOptions} defaultValue={defaults.mode ?? "in_person"} />
          </FormField>
          <FormField label={LABELS.durationHours} name="durationHours" optional state={state}>
            <Input type="number" inputMode="numeric" min={1} max={10000} defaultValue={defaults.durationHours ?? undefined} />
          </FormField>
          <FormField label={LABELS.durationWeeks} name="durationWeeks" optional state={state} hint="A duration in hours or weeks is needed to publish.">
            <Input type="number" inputMode="numeric" min={1} max={520} defaultValue={defaults.durationWeeks ?? undefined} />
          </FormField>
        </div>
        <FormField label={LABELS.skillIds} name="skillIds" optional state={state}>
          {(field) => <SkillPicker {...field} name="skillIds" defaultValue={defaults.skills} maxSelected={30} placeholder="Search skills" />}
        </FormField>
        <FormField label={LABELS.languageCodes} name="languageCodes" optional state={state}>
          {(field) => <MultiCombobox {...field} name="languageCodes" options={languages} defaultValue={defaults.languages} maxSelected={10} placeholder="Choose languages" />}
        </FormField>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Who it is for</legend>
        <FormField label={LABELS.eligibility} name="eligibility" optional state={state} hint="For example minimum age, qualification or trade experience.">
          <Textarea rows={3} maxLength={2000} defaultValue={defaults.eligibility ?? undefined} />
        </FormField>
        <FormField label={LABELS.prerequisites} name="prerequisites" optional state={state}>
          <Textarea rows={3} maxLength={2000} defaultValue={defaults.prerequisites ?? undefined} />
        </FormField>
        <FormField label={LABELS.outcomes} name="outcomes" optional state={state} hint="One outcome per entry, for example Weld 6G pipe joints to a written procedure.">
          {(field) => <TagInput {...field} name="outcomes" defaultValue={defaults.outcomes} maxTags={20} maxLength={300} placeholder="Type an outcome and press Enter" />}
        </FormField>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Fees</legend>
        <p className="text-sm text-muted-foreground">
          Course fees are never a condition of a job application, offer or placement on Venkat Sai Global. Learners see the fee before they apply.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={LABELS.feeType} name="feeType" required state={state}>
            <SimpleSelect options={feeOptions} value={feeType} onValueChange={setFeeType} />
          </FormField>
          {feeType === "fixed" ? (
            <>
              <FormField label={LABELS.feeAmount} name="feeAmount" required state={state}>
                <Input type="number" inputMode="decimal" min={0} step="0.01" defaultValue={defaults.feeAmount ?? undefined} />
              </FormField>
              <FormField label={LABELS.feeCurrency} name="feeCurrency" required state={state}>
                {(field) => <CurrencySelect {...field} options={currencies} defaultValue={defaults.feeCurrency ?? undefined} placeholder="Choose a currency" />}
              </FormField>
            </>
          ) : null}
        </div>
        <FormField label={LABELS.feeNotes} name="feeNotes" optional state={state} hint="For example instalments, what the fee includes, or scholarships.">
          <Input maxLength={500} defaultValue={defaults.feeNotes ?? undefined} />
        </FormField>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Certification</legend>
        <FormField label={LABELS.certificationType} name="certificationType" required state={state}>
          <SimpleSelect options={certificationOptions} value={certification} onValueChange={setCertification} />
        </FormField>
        <p className="rounded-lg bg-surface-subtle p-3 text-sm text-foreground" aria-live="polite">
          {CERTIFICATION_RULES[certification]}
        </p>
        {certification === "accredited_external" ? (
          <>
            {!authorisedIssuer ? (
              <Callout tone="warning" title="Your institution is not authorised as a certificate issuer">
                You can save this course as a draft, but it cannot be published until Venkat Sai authorises your institution after checking your accreditation.
              </Callout>
            ) : null}
            <FormField label={LABELS.accreditationBody} name="accreditationBody" required state={state} hint="Printed on the certificate, for example NCVT.">
              <Input maxLength={200} defaultValue={defaults.accreditationBody ?? undefined} />
            </FormField>
          </>
        ) : null}
      </fieldset>

      <FileUpload
        purpose="course_material"
        name="coverFileId"
        organizationId={organizationId}
        visibility="public"
        label={LABELS.coverFileId}
        description="Optional listing image (JPG, PNG or WebP). It becomes public when saved."
        defaultFiles={defaults.cover ? [defaults.cover] : []}
        onUploadingChange={setUploading}
      />

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{courseId ? "Changes are saved to this course." : "The course is saved as a draft. Add the syllabus next, then submit it for review."}</p>
        <SubmitButton pending={pending} disabled={uploading} pendingLabel="Saving…">
          {courseId ? "Save course" : "Save draft"}
        </SubmitButton>
      </div>
    </form>
  );
}
