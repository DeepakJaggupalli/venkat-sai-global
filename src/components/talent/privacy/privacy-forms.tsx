"use client";

import { useRef, useState } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { keepFormValues, resetFormValues } from "@/components/shared/form/keep-values";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import type { SelectOption } from "@/components/shared/types";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import type { ActionResult, ActionState } from "@/lib/actions";

import { CheckboxField, RadioCards } from "../fields";
import { enumOptions } from "../labels";
import { useTalentForm, useTalentMessages } from "../use-talent-action";

type FormAction<T = undefined> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

export function VisibilityForm({ action, visibility, isOpenToWork }: { action: FormAction; visibility: string; isOpenToWork: boolean }) {
  const ta = useT("talent-account");
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action, { successMessage: ta("toast.saved") });
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate data-testid="privacy-visibility">
      <FormErrorAlert state={state} />
      <RadioCards
        name="visibility"
        legend={t("field.visibility")}
        state={state}
        defaultValue={visibility}
        options={enumOptions(t, "visibility").map((o) => ({ ...o, hint: t(`enum.visibility.${o.value}.hint`) }))}
      />
      <CheckboxField name="isOpenToWork" defaultChecked={isOpenToWork} label={t("field.openToWork")} hint={t("field.openToWork.hint")} />
      <SubmitButton pendingLabel={t("form.saving")}>{ta("action.save")}</SubmitButton>
    </form>
  );
}

export type DisclosureDefaults = {
  showFullNameToEmployers: boolean;
  showContactToUnlockedOnly: boolean;
  showPhoto: boolean;
  showCurrentEmployer: boolean;
  allowDirectContact: boolean;
  allowPartnerSubmissions: boolean;
  blocked: SelectOption[];
};

export function DisclosureForm({
  action,
  search,
  defaults,
}: {
  action: FormAction;
  search: (query: string) => Promise<SelectOption[]>;
  defaults: DisclosureDefaults;
}) {
  const ta = useT("talent-account");
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action, { successMessage: ta("toast.saved") });
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate data-testid="privacy-disclosure">
      <FormErrorAlert state={state} />
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{ta("disclosure.legend")}</legend>
        <CheckboxField name="showFullNameToEmployers" defaultChecked={defaults.showFullNameToEmployers} label={ta("disclosure.fullName")} hint={ta("disclosure.fullName.hint")} />
        <CheckboxField name="showPhoto" defaultChecked={defaults.showPhoto} label={ta("disclosure.photo")} hint={ta("disclosure.photo.hint")} />
        <CheckboxField name="showCurrentEmployer" defaultChecked={defaults.showCurrentEmployer} label={ta("disclosure.currentEmployer")} hint={ta("disclosure.currentEmployer.hint")} />
        <CheckboxField name="showContactToUnlockedOnly" defaultChecked={defaults.showContactToUnlockedOnly} label={ta("disclosure.contactUnlockedOnly")} hint={ta("disclosure.contactUnlockedOnly.hint")} />
        <CheckboxField name="allowDirectContact" defaultChecked={defaults.allowDirectContact} label={ta("disclosure.directContact")} hint={ta("disclosure.directContact.hint")} />
        <CheckboxField name="allowPartnerSubmissions" defaultChecked={defaults.allowPartnerSubmissions} label={ta("disclosure.partnerSubmissions")} hint={ta("disclosure.partnerSubmissions.hint")} />
      </fieldset>
      <FormField label={ta("blocked.label")} name="blockedOrganizationIds" state={state} hint={ta("blocked.hint")}>
        {(field) => (
          <MultiCombobox
            {...field}
            defaultValue={defaults.blocked}
            loadOptions={(query) => search(query)}
            minQueryLength={2}
            maxSelected={100}
            placeholder={ta("blocked.placeholder")}
            searchPlaceholder={ta("blocked.search")}
            typeToSearchText={ta("blocked.typeToSearch")}
            emptyText={t("form.noMatches")}
          />
        )}
      </FormField>
      <SubmitButton pendingLabel={t("form.saving")}>{ta("action.save")}</SubmitButton>
    </form>
  );
}

export type ConsentRow = {
  purpose: string;
  granted: boolean;
  at: string | null;
  /** The candidate can change it in this form. */
  editable: boolean;
  /** Children may not grant it. */
  blockedForMinor: boolean;
};

export function ConsentsForm({ action, rows, minor }: { action: FormAction; rows: ConsentRow[]; minor: boolean }) {
  const ta = useT("talent-account");
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action, { successMessage: ta("toast.saved") });
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-4" noValidate data-testid="privacy-consents">
      <FormErrorAlert state={state} />
      <ul className="divide-y rounded-lg border">
        {rows
          .filter((r) => r.editable)
          .map((row) => {
            const locked = minor && row.blockedForMinor;
            return (
              <li key={row.purpose} className="p-4">
                <CheckboxField
                  name={row.purpose}
                  defaultChecked={row.granted && !locked}
                  disabled={locked}
                  label={ta(`consent.${row.purpose}`)}
                  hint={
                    <>
                      {ta(`consent.${row.purpose}.hint`)}
                      {locked ? <span className="mt-1 block">{ta("consent.minorBlocked")}</span> : null}
                      {row.at ? <span className="mt-1 block text-xs">{ta(row.granted ? "consent.grantedOn" : "consent.withdrawnOn", { date: row.at })}</span> : null}
                    </>
                  }
                />
              </li>
            );
          })}
      </ul>
      <SubmitButton pendingLabel={t("form.saving")}>{ta("consent.save")}</SubmitButton>
    </form>
  );
}

/** Data-subject requests: export, correction, deletion (optionally closing the account). */
export function DataRequestForm({ action, kind }: { action: FormAction<{ code: string }>; kind: "export" | "correction" | "deletion" }) {
  const ta = useT("talent-account");
  const { t } = useTalentMessages();
  const [created, setCreated] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [raw, formAction] = useTalentForm(action, {
    successMessage: ta("requests.toast"),
    onSuccess: (result) => {
      setCreated(result.ok ? (result.data?.code ?? null) : null);
      // The request is sent: start the next one empty (the form otherwise keeps what was typed).
      resetFormValues(formRef.current);
    },
  });
  const state: ActionState<{ code: string }> =
    raw && !raw.ok && raw.fieldErrors?.understood
        ? { ...raw, fieldErrors: { ...raw.fieldErrors, understood: [ta("requests.confirmRequired")] } }
        : raw;
  return (
    <form ref={formRef} action={formAction} onResetCapture={keepFormValues} className="space-y-4" noValidate data-testid={`privacy-request-${kind}`}>
      <FormErrorAlert state={state} />
      {kind === "correction" ? (
        <FormField label={ta("requests.correction.details")} name="details" required state={state} hint={ta("requests.correction.hint")}>
          <Textarea rows={4} maxLength={4000} />
        </FormField>
      ) : null}
      {kind === "deletion" ? (
        <>
          <FormField label={ta("requests.deletion.details")} name="details" state={state}>
            <Textarea rows={3} maxLength={4000} />
          </FormField>
          <CheckboxField name="understood" required state={state} label={ta("requests.deletion.understood")} />
        </>
      ) : null}
      <SubmitButton variant={kind === "deletion" ? "destructive" : "default"} pendingLabel={t("form.saving")}>
        {ta(`requests.${kind}.submit`)}
      </SubmitButton>
      <p aria-live="polite" className="text-sm text-success-strong">
        {created ? ta("requests.created", { code: created }) : null}
      </p>
    </form>
  );
}
