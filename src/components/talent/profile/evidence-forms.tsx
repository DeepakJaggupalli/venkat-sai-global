"use client";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField } from "@/components/shared/form";
import { CountrySelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CandidateCredentialView, CandidateDocumentView, CandidatePortfolioView } from "@/modules/candidates/types";

import { CheckboxField, CheckboxGroup, FieldGrid, RadioCards } from "../fields";
import { enumOptions } from "../labels";
import { useTalentForm, useTalentMessages } from "../use-talent-action";
import { useDialogClose } from "./dialog";
import { FormFooterBar, type FormAction } from "./form-footer";


export function CredentialForm({
  action,
  item,
  skills,
  linkedSkillIds,
}: {
  action: FormAction;
  item: CandidateCredentialView | null;
  /** Skills on the profile that this credential may evidence. */
  skills: SelectOption[];
  linkedSkillIds: string[];
}) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormErrorAlert state={state} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FieldGrid>
        <FormField label={t("field.credentialType")} name="credentialType" required state={state}>
          {(field) => <SimpleSelect {...field} options={enumOptions(t, "credentialType")} defaultValue={item?.credentialType} placeholder={t("form.select")} />}
        </FormField>
        <FormField label={t("field.credentialName")} name="name" required state={state}>
          <Input defaultValue={item?.name ?? ""} maxLength={200} />
        </FormField>
        <FormField label={t("field.issuer")} name="issuer" state={state}>
          <Input defaultValue={item?.issuer ?? ""} maxLength={200} />
        </FormField>
        <FormField label={t("field.credentialNumber")} name="credentialNumber" state={state}>
          <Input defaultValue={item?.credentialNumber ?? ""} maxLength={80} autoComplete="off" />
        </FormField>
        <FormField label={t("field.issuedAt")} name="issuedAt" state={state}>
          <Input type="date" defaultValue={item?.issuedAt ?? ""} />
        </FormField>
        <FormField label={t("field.expiresAt")} name="expiresAt" state={state}>
          <Input type="date" defaultValue={item?.expiresAt ?? ""} />
        </FormField>
      </FieldGrid>
      <RadioCards
        name="issuerType"
        legend={t("field.issuerType")}
        state={state}
        defaultValue={item?.issuerType === "accredited_external" ? "accredited_external" : "self_declared"}
        options={[
          { value: "accredited_external", label: t("issuer.accredited_external"), hint: t("issuer.accredited_external.hint") },
          { value: "self_declared", label: t("issuer.self_declared"), hint: t("issuer.self_declared.hint") },
        ]}
      />
      <p className="text-sm text-muted-foreground">{t("issuer.venkatSaiNote")}</p>
      <FileUpload purpose="candidate_credential" name="fileId" label={t("field.credentialCopy")} description={t("field.credentialCopy.hint")} defaultFiles={item?.file ? [item.file] : []} />
      {skills.length ? (
        <CheckboxGroup name="linkedSkillIds" legend={t("field.linkedSkills")} hint={t("field.linkedSkills.hint")} options={skills} defaultValue={linkedSkillIds} state={state} columns={3} />
      ) : null}
      <FormFooterBar close={close} />
    </form>
  );
}

export function DocumentForm({ action, item, countries }: { action: FormAction; item: CandidateDocumentView | null; countries: SelectOption[] }) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  const fileInvalid = Boolean(state && !state.ok && state.fieldErrors?.fileId);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormErrorAlert state={state} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item && item.verificationStatus !== "unverified" ? <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">{t("documents.editResets")}</p> : null}
      <FieldGrid>
        <FormField label={t("field.documentType")} name="documentType" required state={state}>
          {(field) => <SimpleSelect {...field} options={enumOptions(t, "documentType")} defaultValue={item?.documentType} placeholder={t("form.select")} />}
        </FormField>
        <FormField label={t("field.documentTitle")} name="title" state={state}>
          <Input defaultValue={item?.title ?? ""} maxLength={150} />
        </FormField>
      </FieldGrid>
      <div>
        <FileUpload
          purpose="candidate_document"
          name="fileId"
          label={item ? t("field.replaceFile") : t("field.documentFile")}
          description={item ? t("field.replaceFile.hint") : t("field.documentFile.hint")}
          required={!item}
          invalid={fileInvalid}
          errorId="document-file-error"
        />
        {fileInvalid ? (
          <p id="document-file-error" className="mt-1 text-sm font-medium text-danger-strong">
            {state && !state.ok ? state.fieldErrors?.fileId?.join(" ") : null}
          </p>
        ) : null}
      </div>
      <FieldGrid>
        <FormField
          label={t("field.documentNumber")}
          name="documentNumber"
          state={state}
          hint={item?.numberLast4 ? t("field.documentNumber.stored", { last4: item.numberLast4 }) : t("field.documentNumber.hint")}
        >
          <Input autoComplete="off" spellCheck={false} maxLength={40} />
        </FormField>
        <FormField label={t("field.issuingCountry")} name="issuingCountryCode" state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={item?.issuingCountryCode ?? undefined} placeholder={t("form.selectCountry")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
        <FormField label={t("field.issuedAt")} name="issuedAt" state={state}>
          <Input type="date" defaultValue={item?.issuedAt ?? ""} />
        </FormField>
        <FormField label={t("field.expiresAt")} name="expiresAt" state={state}>
          <Input type="date" defaultValue={item?.expiresAt ?? ""} />
        </FormField>
      </FieldGrid>
      {item?.numberLast4 ? <CheckboxField name="clearDocumentNumber" label={t("field.documentNumber.clear")} /> : null}
      <CheckboxField name="isShareableWithEmployers" defaultChecked={item?.isShareableWithEmployers ?? false} label={t("documents.shareable")} hint={t("documents.shareable.hint")} />
      <FormFooterBar close={close} />
    </form>
  );
}

export function PortfolioForm({ action, item }: { action: FormAction; item: CandidatePortfolioView | null }) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormErrorAlert state={state} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormField label={t("field.portfolioTitle")} name="title" required state={state}>
        <Input defaultValue={item?.title ?? ""} maxLength={150} />
      </FormField>
      <FormField label={t("field.description")} name="description" state={state}>
        <Textarea defaultValue={item?.description ?? ""} maxLength={2000} rows={4} />
      </FormField>
      <FieldGrid>
        <FormField label={t("field.projectDate")} name="projectDate" state={state}>
          <Input type="date" defaultValue={item?.projectDate ?? ""} />
        </FormField>
        <FormField label={t("field.projectLocation")} name="location" state={state}>
          <Input defaultValue={item?.location ?? ""} maxLength={150} />
        </FormField>
      </FieldGrid>
      <FileUpload purpose="portfolio_media" name="mediaFileIds" multiple maxFiles={10} label={t("field.media")} description={t("field.media.hint")} defaultFiles={item?.media ?? []} />
      <FormField label={t("field.videoUrl")} name="videoUrl" state={state} hint={t("field.videoUrl.hint")}>
        <Input type="url" inputMode="url" defaultValue={item?.videoUrl ?? ""} placeholder="https://www.youtube.com/watch?v=…" />
      </FormField>
      <FormField label={t("field.tags")} name="tags" state={state}>
        {(field) => <TagInput {...field} defaultValue={item?.tags ?? []} maxTags={10} maxLength={40} lowercase placeholder={t("field.tags.placeholder")} />}
      </FormField>
      <CheckboxField name="isPublic" defaultChecked={item?.isPublic ?? false} label={t("portfolio.public")} hint={t("portfolio.public.hint")} />
      <FormFooterBar close={close} />
    </form>
  );
}
