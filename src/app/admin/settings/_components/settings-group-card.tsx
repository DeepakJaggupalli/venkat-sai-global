import type { ReactNode } from "react";

import { ActionForm, type AdminFieldSpec } from "@/components/admin/action-form";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { SectionCard } from "@/components/shared/section-card";
import type { SelectOption } from "@/components/shared/types";
import { SETTINGS, type SettingKey } from "@/config/settings";

import { saveSettingsGroupAction } from "../actions";
import { displayValue, fieldName, SELLER_FIELDS, settingMeta } from "../_lib/catalog";
import type { SettingState } from "../_lib/settings-admin";

type Props = {
  group: string;
  title?: string;
  description?: ReactNode;
  keys: SettingKey[];
  states: Map<SettingKey, SettingState>;
  canEdit: boolean;
  currencies: SelectOption[];
  countries: SelectOption[];
  timeZone?: string;
};

/** One group of the settings catalogue: typed form for editors, read-only list otherwise. */
export function SettingsGroupCard({ group, title, description, keys, states, canEdit, currencies, countries, timeZone }: Props) {
  const lastChange = keys
    .map((k) => states.get(k))
    .filter((s): s is SettingState => Boolean(s?.updatedAt))
    .sort((a, b) => b.updatedAt!.getTime() - a.updatedAt!.getTime())[0];
  const footer = lastChange ? (
    <p className="text-xs text-muted-foreground">
      Last changed <DateText value={lastChange.updatedAt!} mode="datetime" timeZone={timeZone} />
      {lastChange.updatedBy ? ` by ${lastChange.updatedBy}` : ""}. Every change is recorded in the audit log.
    </p>
  ) : (
    <p className="text-xs text-muted-foreground">All values are the platform defaults. Every change is recorded in the audit log.</p>
  );

  if (!canEdit) {
    return (
      <SectionCard title={title ?? group} description={description} footer={footer} id={`group-${slug(group)}`}>
        <KeyValueList
          columns={2}
          items={keys.flatMap((key) => {
            const value = states.get(key)?.value;
            if (settingMeta(key).kind === "seller") {
              const v = (value ?? {}) as Record<string, string>;
              return SELLER_FIELDS.map((f) => ({ key: `${key}.${f.name}`, label: f.label, value: v[f.name] || null }));
            }
            return [{ key, label: SETTINGS[key].label, value: displayValue(value) }];
          })}
        />
      </SectionCard>
    );
  }

  const fields: AdminFieldSpec[] = keys.flatMap((key): AdminFieldSpec[] => {
    const meta = settingMeta(key);
    const state = states.get(key);
    const value = state?.value;
    const def = SETTINGS[key].default;
    const defaultHint = state && !state.isDefault && meta.kind !== "seller" ? `Default: ${displayValue(def)}.` : undefined;
    const hint = [meta.hint, defaultHint].filter(Boolean).join(" ") || undefined;
    switch (meta.kind) {
      case "boolean":
        return [{ name: key, label: meta.label, kind: "checkbox", defaultValue: value === true, hint, wide: true }];
      case "number":
        return [{ name: key, label: meta.label, kind: "number", defaultValue: value as number, min: meta.min, max: meta.max, step: "1", required: true, hint }];
      case "currency":
        return [{ name: key, label: meta.label, kind: "search-select", options: currencies, defaultValue: value as string, required: true, hint }];
      case "country":
        return [{ name: key, label: meta.label, kind: "search-select", options: countries, defaultValue: value as string, required: true, hint }];
      case "seller": {
        const v = (value ?? {}) as Record<string, string>;
        return SELLER_FIELDS.map((f) => ({
          name: fieldName(key, f.name),
          label: f.label,
          kind: f.textarea ? ("textarea" as const) : ("text" as const),
          defaultValue: v[f.name] ?? "",
          required: f.required,
          optional: !f.required,
          hint: f.hint,
          wide: f.textarea,
        }));
      }
      default:
        return [{ name: key, label: meta.label, defaultValue: (value as string) ?? "", optional: true, hint }];
    }
  });

  return (
    <SectionCard title={title ?? group} description={description} footer={footer} id={`group-${slug(group)}`}>
      <ActionForm action={saveSettingsGroupAction} hidden={{ group }} fields={fields} columns={2} submitLabel={`Save ${(title ?? group).toLowerCase()} settings`} testId={`settings-form-${slug(group)}`} />
    </SectionCard>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
