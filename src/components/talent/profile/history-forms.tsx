"use client";

import { useState } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { CountrySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CandidateEducationView, CandidateExperienceView } from "@/modules/candidates/types";

import { FieldGrid } from "../fields";
import { enumOptions } from "../labels";
import { useTalentForm, useTalentMessages } from "../use-talent-action";
import { useDialogClose } from "./dialog";
import { FormFooterBar, type FormAction } from "./form-footer";

const month = (date: string | null | undefined) => (date ? date.slice(0, 7) : "");

export function EducationForm({
  action,
  item,
  levels,
  qualificationTypes,
  countries,
}: {
  action: FormAction;
  item: CandidateEducationView | null;
  levels: SelectOption[];
  qualificationTypes: SelectOption[];
  countries: SelectOption[];
}) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  const [current, setCurrent] = useState(item?.isCurrent ?? false);
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate>
      <FormErrorAlert state={state} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item?.verificationStatus === "verified" ? <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">{t("verification.editResets")}</p> : null}
      <FormField label={t("field.institution")} name="institutionName" required state={state}>
        <Input defaultValue={item?.institutionName ?? ""} maxLength={200} />
      </FormField>
      <FieldGrid>
        <FormField label={t("field.educationLevel")} name="educationLevelId" state={state}>
          {(field) => <SimpleSelect {...field} options={levels} defaultValue={item?.educationLevel?.id} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.qualificationType")} name="qualificationTypeId" state={state}>
          {(field) => <SearchableSelect {...field} options={qualificationTypes} defaultValue={item?.qualificationType?.id} placeholder={t("form.select")} searchPlaceholder={t("form.search")} emptyText={t("form.noMatches")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.qualification")} name="qualification" state={state}>
          <Input defaultValue={item?.qualification ?? ""} maxLength={200} />
        </FormField>
        <FormField label={t("field.specialisation")} name="specialisation" state={state}>
          <Input defaultValue={item?.specialisation ?? ""} maxLength={200} />
        </FormField>
        <FormField label={t("field.board")} name="boardOrUniversity" state={state}>
          <Input defaultValue={item?.boardOrUniversity ?? ""} maxLength={200} />
        </FormField>
        <FormField label={t("field.country")} name="countryCode" state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={item?.countryCode ?? undefined} placeholder={t("form.selectCountry")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.startDate")} name="startDate" state={state}>
          <Input type="month" defaultValue={month(item?.startDate)} />
        </FormField>
        <FormField label={t("field.endDate")} name="endDate" state={state} hint={current ? t("field.endDate.expected") : undefined}>
          <Input type="month" defaultValue={month(item?.endDate)} />
        </FormField>
        <FormField label={t("field.grade")} name="gradeOrScore" state={state}>
          <Input defaultValue={item?.gradeOrScore ?? ""} maxLength={40} />
        </FormField>
      </FieldGrid>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="isCurrent" defaultChecked={item?.isCurrent} onChange={(e) => setCurrent(e.target.checked)} className="size-4 accent-teal-strong" />
        {t("field.studyingHere")}
      </label>
      <FileUpload purpose="candidate_document" name="documentFileId" label={t("field.supportingDocument")} description={t("field.supportingDocument.hint")} defaultFiles={item?.document ? [item.document] : []} />
      <FormFooterBar close={close} />
    </form>
  );
}

export function ExperienceForm({
  action,
  item,
  industries,
  categories,
  countries,
}: {
  action: FormAction;
  item: CandidateExperienceView | null;
  industries: SelectOption[];
  categories: SelectOption[];
  countries: SelectOption[];
}) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  const [current, setCurrent] = useState(item?.isCurrent ?? false);
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate>
      <FormErrorAlert state={state} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item?.verificationStatus === "verified" ? <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">{t("verification.editResets")}</p> : null}
      <FieldGrid>
        <FormField label={t("field.jobTitle")} name="jobTitle" required state={state}>
          <Input defaultValue={item?.jobTitle ?? ""} maxLength={120} />
        </FormField>
        <FormField label={t("field.employer")} name="employerName" required state={state}>
          <Input defaultValue={item?.employerName ?? ""} maxLength={150} />
        </FormField>
        <FormField label={t("field.employmentType")} name="employmentType" state={state}>
          {(field) => <SimpleSelect {...field} options={enumOptions(t, "employmentType")} defaultValue={item?.employmentType ?? undefined} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.industry")} name="industryId" state={state}>
          {(field) => <SearchableSelect {...field} options={industries} defaultValue={item?.industry?.id} placeholder={t("form.select")} searchPlaceholder={t("form.search")} emptyText={t("form.noMatches")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.category")} name="jobCategoryId" state={state}>
          {(field) => <SearchableSelect {...field} options={categories} defaultValue={item?.jobCategory?.id} placeholder={t("form.select")} searchPlaceholder={t("form.search")} emptyText={t("form.noMatches")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.country")} name="countryCode" state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={item?.countryCode ?? undefined} placeholder={t("form.selectCountry")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.city")} name="city" state={state}>
          <Input defaultValue={item?.city ?? ""} maxLength={120} />
        </FormField>
        <div className="hidden sm:block" aria-hidden="true" />
        <FormField label={t("field.startDate")} name="startDate" state={state}>
          <Input type="month" defaultValue={month(item?.startDate)} />
        </FormField>
        {current ? null : (
          <FormField label={t("field.endDate")} name="endDate" state={state}>
            <Input type="month" defaultValue={month(item?.endDate)} />
          </FormField>
        )}
      </FieldGrid>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="isCurrent" defaultChecked={item?.isCurrent} onChange={(e) => setCurrent(e.target.checked)} className="size-4 accent-teal-strong" />
        {t("field.currentJob")}
      </label>
      <FormField label={t("field.responsibilities")} name="responsibilities" state={state}>
        <Textarea defaultValue={item?.responsibilities ?? ""} maxLength={4000} rows={4} />
      </FormField>
      <FormField label={t("field.projects")} name="projects" state={state}>
        <Textarea defaultValue={item?.projects ?? ""} maxLength={4000} rows={3} />
      </FormField>
      <FormField label={t("field.achievements")} name="achievements" state={state}>
        <Textarea defaultValue={item?.achievements ?? ""} maxLength={2000} rows={3} />
      </FormField>
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">{t("field.reference")}</legend>
        <p className="text-sm text-muted-foreground">{t("field.reference.hint")}</p>
        <FieldGrid>
          <FormField label={t("field.referenceName")} name="referenceName" state={state}>
            <Input defaultValue={item?.reference?.name ?? ""} maxLength={120} autoComplete="off" />
          </FormField>
          <FormField label={t("field.referenceContact")} name="referenceContact" state={state}>
            <Input defaultValue={item?.reference?.contact ?? ""} maxLength={150} autoComplete="off" />
          </FormField>
        </FieldGrid>
      </fieldset>
      <FileUpload purpose="candidate_document" name="evidenceFileId" label={t("field.evidence")} description={t("field.evidence.hint")} defaultFiles={item?.evidence ? [item.evidence] : []} />
      <FormFooterBar close={close} />
    </form>
  );
}

