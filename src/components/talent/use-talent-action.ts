"use client";

import { useActionState, useMemo } from "react";

import { useActionToast } from "@/components/shared/form/use-action-toast";
import { useT } from "@/i18n/client";
import type { ActionResult, ActionState, FieldErrors } from "@/lib/actions";

/**
 * Module actions answer in English (the candidates module documents that the People Portal
 * translates by outcome and error `code`). This maps known messages to talent-profile keys so the
 * candidate reads Hindi / Telugu; anything unknown falls back to the English text.
 */
const FIELD_MESSAGE_KEYS: Record<string, string> = {
  "Enter a valid date": "fieldError.date",
  "Date is required": "fieldError.required",
  "Too long": "fieldError.tooLong",
  "Too short": "fieldError.tooShort",
  "Choose a valid option": "fieldError.option",
  "Invalid identifier": "fieldError.option",
  "Enter a number": "fieldError.number",
  "Enter a whole number": "fieldError.number",
  "Enter an amount": "fieldError.number",
  "Amount cannot be negative": "fieldError.number",
  "Enter a valid email address": "fieldError.email",
  "Enter a valid phone number with country code": "fieldError.phone",
  "Date of birth cannot be in the future": "fieldError.dobFuture",
  "Enter a valid date of birth": "fieldError.date",
  "End date must be after the start date": "fieldError.endBeforeStart",
  "Start date cannot be in the future": "fieldError.startFuture",
  "Leave the end date empty for your current job": "fieldError.currentNoEnd",
  "Expiry must be after the issue date": "fieldError.expiryBeforeIssue",
  "Issue date cannot be in the future": "fieldError.issueFuture",
  "Choose a currency": "fieldError.currency",
  "Choose a pay period": "fieldError.period",
  "Enter a realistic amount": "fieldError.number",
  "Upload the document": "fieldError.uploadDocument",
  "Use a YouTube or Vimeo link starting with https://": "fieldError.videoUrl",
  "Enter the number exactly as printed (letters and digits only)": "fieldError.identityNumber",
  "Set your passport status to valid or expired to save a passport number": "fieldError.passportStatus",
  "Choose a skill from the list": "fieldError.option",
  "Choose your level": "fieldError.option",
  "Choose a document type": "fieldError.option",
  "Choose a type": "fieldError.option",
  "Choose who can find your profile": "fieldError.option",
  "Each skill can be added once": "fieldError.duplicate",
  "Each language can be added once": "fieldError.duplicate",
  "Each location can be added once": "fieldError.duplicate",
};

const FORM_MESSAGE_KEYS: Record<string, string> = {
  "Please correct the highlighted fields.": "form.fixFields",
  "Invalid request.": "form.generic",
  "Something went wrong. Please try again.": "form.generic",
};

export function useTalentMessages() {
  const t = useT("talent-profile");
  return useMemo(() => {
    const translateField = (message: string): string => {
      const key = FIELD_MESSAGE_KEYS[message] ?? (message.endsWith(" is required") ? "fieldError.required" : message.endsWith(" is too long") ? "fieldError.tooLong" : null);
      return key ? t(key) : message;
    };
    const translateError = (result: Extract<ActionResult<unknown>, { ok: false }>): string => {
      if (result.code) {
        const key = `error.code.${result.code}`;
        const translated = t(key);
        if (translated !== key) return translated;
      }
      const key = FORM_MESSAGE_KEYS[result.error];
      return key ? t(key) : result.error;
    };
    return { t, translateField, translateError };
  }, [t]);
}

/** Translate a failed result (form error + field errors); successes get `successMessage`. */
export function useLocalizedState<T>(state: ActionState<T>, successMessage?: string): ActionState<T> {
  const { translateField, translateError } = useTalentMessages();
  return useMemo(() => {
    if (!state) return state;
    if (state.ok) return { ...state, message: successMessage ?? state.message };
    const fieldErrors: FieldErrors | undefined = state.fieldErrors
      ? Object.fromEntries(Object.entries(state.fieldErrors).map(([key, messages]) => [key, messages.map(translateField)]))
      : undefined;
    return { ...state, error: translateError(state), fieldErrors };
  }, [state, successMessage, translateField, translateError]);
}

/**
 * useActionState + translated result + success toast. Returns the localized state for FormField /
 * FormErrorAlert, the form action and the pending flag.
 */
export function useTalentForm<T>(
  action: (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>,
  opts: { successMessage?: string; onSuccess?: (state: ActionResult<T>) => void } = {},
) {
  const [raw, formAction, pending] = useActionState(action, null);
  const state = useLocalizedState(raw, opts.successMessage);
  useActionToast(state, { onSuccess: opts.onSuccess });
  return [state, formAction, pending] as const;
}
