"use client";

import { BadgeCheck, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";

import { FormErrorAlert, FormField } from "@/components/shared/form";
import { LanguageSelect, SimpleSelect } from "@/components/shared/selects";
import { SkillPicker } from "@/components/shared/skill-picker";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CandidateLanguageView, CandidateSkillView } from "@/modules/candidates/types";

import { enumOptions } from "../labels";
import { useTalentForm, useTalentMessages } from "../use-talent-action";
import { useDialogClose } from "./dialog";
import { FormFooterBar, type FormAction } from "./form-footer";

type SkillDraft = { skillId: string; name: string; level: string; yearsExperience: string; isPrimary: boolean; verified: boolean };

export function SkillsForm({ action, skills }: { action: FormAction; skills: CandidateSkillView[] }) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  const [rows, setRows] = useState<SkillDraft[]>(() =>
    skills.map((s) => ({ skillId: s.skillId, name: s.name, level: s.level ?? "", yearsExperience: s.yearsExperience === null ? "" : String(s.yearsExperience), isPrimary: s.isPrimary, verified: s.verified })),
  );
  const primaryCount = rows.filter((r) => r.isPrimary).length;
  const payload = rows.map((r) => ({
    skillId: r.skillId,
    level: r.level || null,
    yearsExperience: r.yearsExperience === "" ? null : Number(r.yearsExperience),
    isPrimary: r.isPrimary,
  }));
  const update = (id: string, patch: Partial<SkillDraft>) => setRows((all) => all.map((r) => (r.skillId === id ? { ...r, ...patch } : r)));
  const add = (picked: SelectOption[]) =>
    setRows((all) => {
      const known = new Set(all.map((r) => r.skillId));
      const fresh = picked.filter((p) => !known.has(p.value)).map((p) => ({ skillId: p.value, name: p.label, level: "", yearsExperience: "", isPrimary: false, verified: false }));
      return [...all, ...fresh].slice(0, 50);
    });

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormErrorAlert state={state} />
      <input type="hidden" name="skills:json" value={JSON.stringify(payload)} />
      <FormField label={t("skills.add")} hint={t("skills.addHint")}>
        {(field) => <SkillPicker {...field} value={[]} onChange={add} maxSelected={50} placeholder={t("form.selectSkills")} searchPlaceholder={t("form.searchSkills")} emptyText={t("form.noMatches")} />}
      </FormField>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("skills.primaryCount", { count: primaryCount, max: 5 })}
      </p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("skills.empty")}</p> : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.skillId} className="rounded-lg border p-3">
            <fieldset className="space-y-3">
              <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {row.name}
                {row.verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-strong">
                    <BadgeCheck aria-hidden="true" className="size-3.5" />
                    {t("skills.verified")}
                  </span>
                ) : null}
              </legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end">
                <FormField label={t("field.skillLevel")}>
                  {(field) => <SimpleSelect {...field} options={enumOptions(t, "skillLevel")} value={row.level} onValueChange={(v) => update(row.skillId, { level: v })} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
                </FormField>
                <FormField label={t("field.years")}>
                  <Input type="number" min={0} max={60} inputMode="numeric" value={row.yearsExperience} onChange={(e) => update(row.skillId, { yearsExperience: e.target.value })} />
                </FormField>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={row.isPrimary}
                    disabled={!row.isPrimary && primaryCount >= 5}
                    onChange={(e) => update(row.skillId, { isPrimary: e.target.checked })}
                    className="size-4 accent-teal-strong"
                  />
                  <Star aria-hidden="true" className="size-4 text-gold-strong" />
                  {t("skills.primary")}
                </label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRows((all) => all.filter((r) => r.skillId !== row.skillId))} aria-label={`${t("action.remove")}: ${row.name}`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {row.verified ? <p className="text-xs text-muted-foreground">{t("skills.removeVerifiedNote")}</p> : null}
            </fieldset>
          </li>
        ))}
      </ul>
      <FormFooterBar close={close} />
    </form>
  );
}

type LanguageDraft = { key: number; languageCode: string; proficiency: string; canRead: boolean; canWrite: boolean; canSpeak: boolean };

export function LanguagesForm({ action, languages, options }: { action: FormAction; languages: CandidateLanguageView[]; options: SelectOption[] }) {
  const { t } = useTalentMessages();
  const close = useDialogClose();
  const [state, formAction] = useTalentForm(action, { successMessage: t("toast.saved"), onSuccess: close });
  const [rows, setRows] = useState<LanguageDraft[]>(() =>
    languages.map((l, i) => ({ key: i, languageCode: l.code, proficiency: l.proficiency, canRead: l.canRead, canWrite: l.canWrite, canSpeak: l.canSpeak })),
  );
  const [nextKey, setNextKey] = useState(languages.length);
  const payload = rows.filter((r) => r.languageCode).map((r) => ({ languageCode: r.languageCode, proficiency: r.proficiency, canRead: r.canRead, canWrite: r.canWrite, canSpeak: r.canSpeak }));
  const update = (key: number, patch: Partial<LanguageDraft>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormErrorAlert state={state} />
      <input type="hidden" name="languages:json" value={JSON.stringify(payload)} />
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("languages.empty")}</p> : null}
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="rounded-lg border p-3">
            <fieldset className="space-y-3">
              <legend className="sr-only">{t("languages.item", { n: index + 1 })}</legend>
              <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_auto] sm:items-end">
                <FormField label={t("field.language")}>
                  {(field) => <LanguageSelect {...field} options={options} value={row.languageCode} onValueChange={(v) => update(row.key, { languageCode: v })} placeholder={t("form.select")} searchPlaceholder={t("form.search")} emptyText={t("form.noMatches")} />}
                </FormField>
                <FormField label={t("field.proficiency")}>
                  {(field) => <SimpleSelect {...field} options={enumOptions(t, "proficiency")} value={row.proficiency} onValueChange={(v) => update(row.key, { proficiency: v })} placeholder={t("form.select")} />}
                </FormField>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))} aria-label={`${t("action.remove")}: ${t("languages.item", { n: index + 1 })}`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-4">
                {(["canRead", "canWrite", "canSpeak"] as const).map((skill) => (
                  <label key={skill} className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" checked={row[skill]} onChange={(e) => update(row.key, { [skill]: e.target.checked })} className="size-4 accent-teal-strong" />
                    {t(`languages.${skill}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      {rows.length < 15 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRows((all) => [...all, { key: nextKey, languageCode: "", proficiency: "conversational", canRead: true, canWrite: false, canSpeak: true }]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus aria-hidden="true" />
          {t("languages.add")}
        </Button>
      ) : null}
      <FormFooterBar close={close} />
    </form>
  );
}
