"use client";

import { Info } from "lucide-react";
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ALL_OPTIONAL_CONSENT,
  NO_OPTIONAL_CONSENT,
  type ConsentCategories,
  type ConsentSource,
  type OptionalConsentCategory,
  type StoredConsent,
} from "@/modules/analytics/consent";
import type { ConsentServices } from "@/modules/analytics/types";

import { consentMessages } from "./messages";
import { useConsent } from "./use-consent";

export type ConsentPreferencesFormProps = {
  /** Consent version from the server (ConsentPreferences passes it); otherwise the one registered by the banner. */
  version?: string;
  /** Optional third-party services to disclose (from getConsentServices()). */
  services?: ConsentServices;
  /** UI language: "en" | "hi" | "te" (defaults to the document language). */
  locale?: string;
  /** Recorded on the consent receipt: cookie_preferences (page), account_privacy (/account/privacy), cookie_banner (dialog). */
  source?: ConsentSource;
  onSaved?: (consent: StoredConsent) => void;
  className?: string;
};

type Status = { kind: "saved" | "error"; message: string } | null;

const noopSubscribe = () => () => undefined;
const readDocumentLocale = (): string => document.documentElement.lang || "en";

/**
 * Cookie preferences: essential (always on) plus functional, analytics and session insights switches.
 * Switches are never pre-ticked — they show the visitor's current choice, or off when there is none.
 * Reusable on /cookie-preferences, /account/privacy and inside the consent banner's dialog.
 */
export function ConsentPreferencesForm({ version, services, locale, source = "cookie_preferences", onSaved, className }: ConsentPreferencesFormProps) {
  const consent = useConsent(version);
  const documentLocale = useSyncExternalStore(noopSubscribe, readDocumentLocale, () => "en");
  const resolvedLocale = locale ?? documentLocale;
  const t = consentMessages(resolvedLocale);
  // Unsaved edits; null shows the visitor's current choice (all off when there is none — never pre-ticked).
  const [draft, setDraft] = useState<ConsentCategories | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const baseId = useId();
  const choice = draft ?? (consent.ready ? consent.categories : NO_OPTIONAL_CONSENT);

  const apply = (next: ConsentCategories, method?: "accept_all" | "reject_all" | "custom") => {
    const result = consent.save(next, { method: method === "reject_all" ? undefined : method, source, locale: resolvedLocale });
    if (result.ok) {
      setDraft(null);
      setStatus({ kind: "saved", message: t.saved });
      onSaved?.(result.consent);
    } else {
      setStatus({ kind: "error", message: t.saveError });
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply(choice);
  };

  const toggle = (key: OptionalConsentCategory, value: boolean) => {
    setDraft({ ...choice, [key]: value });
    setStatus(null);
  };

  const rows: { key: OptionalConsentCategory; title: string; description: string; extra?: string }[] = [
    { key: "functional", title: t.functionalTitle, description: t.functionalDescription },
    { key: "analytics", title: t.analyticsTitle, description: t.analyticsDescription, extra: services?.ga4 ? t.analyticsGa4 : undefined },
    {
      key: "session_insights",
      title: t.sessionInsightsTitle,
      description: t.sessionInsightsDescription,
      extra: services ? (services.clarity ? t.sessionInsightsClarity : t.sessionInsightsNotInUse) : undefined,
    },
  ];

  const lastSaved =
    consent.ready && consent.stored && consent.version && consent.stored.version === consent.version
      ? new Intl.DateTimeFormat(resolvedLocale === "en" ? "en-IN" : resolvedLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(consent.stored.timestamp))
      : null;

  return (
    <form onSubmit={onSubmit} className={cn("space-y-4", className)} aria-describedby={consent.ready && consent.gpc ? `${baseId}-gpc` : undefined} noValidate>
      {consent.ready && consent.gpc ? (
        <p id={`${baseId}-gpc`} className="flex gap-2 rounded-lg border border-info/30 bg-info-soft p-3 text-sm text-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
          <span>{t.gpcNote}</span>
        </p>
      ) : null}

      <ul className="divide-y rounded-lg border">
        <li className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="font-medium" id={`${baseId}-essential`}>
              {t.essentialTitle}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t.essentialDescription}</p>
          </div>
          <span className="shrink-0 rounded-md bg-surface-subtle px-2 py-1 text-xs font-medium text-muted-foreground" aria-describedby={`${baseId}-essential`}>
            {t.alwaysOn}
          </span>
        </li>
        {rows.map((row) => {
          const switchId = `${baseId}-${row.key}`;
          const descriptionId = `${switchId}-description`;
          return (
            <li key={row.key} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <label htmlFor={switchId} className="font-medium">
                  {row.title}
                </label>
                <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                  {row.description}
                  {row.extra ? <span className="mt-1 block">{row.extra}</span> : null}
                </p>
              </div>
              <Switch
                id={switchId}
                className="mt-0.5"
                checked={choice[row.key]}
                onCheckedChange={(value) => toggle(row.key, value === true)}
                aria-describedby={descriptionId}
                disabled={!consent.ready}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="submit" disabled={!consent.ready}>
          {t.save}
        </Button>
        <Button type="button" variant="outline" disabled={!consent.ready} onClick={() => apply({ ...ALL_OPTIONAL_CONSENT }, "accept_all")}>
          {t.acceptAll}
        </Button>
        <Button type="button" variant="outline" disabled={!consent.ready} onClick={() => apply({ ...NO_OPTIONAL_CONSENT }, "reject_all")}>
          {t.rejectAll}
        </Button>
      </div>

      <div aria-live="polite" role="status" className="min-h-5 text-sm">
        {status ? (
          <p className={status.kind === "error" ? "text-danger-strong" : "text-success-strong"}>{status.message}</p>
        ) : lastSaved ? (
          <p className="text-muted-foreground">{t.lastSaved.replace("{date}", lastSaved)}</p>
        ) : null}
      </div>
    </form>
  );
}
