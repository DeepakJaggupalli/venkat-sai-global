/**
 * Pure helpers for the screening-question builder (client-safe). The payload matches
 * `screeningQuestionSchema` in src/modules/jobs/schemas.ts and is posted as `screeningQuestions:json`.
 * Review rules ("knockout") only flag an application for a person to look at — they never reject it.
 */
export type ScreeningType = "text" | "yes_no" | "single_choice" | "multi_choice" | "number";

export type KnockoutRule =
  | { kind: "equals"; value: string | number | boolean }
  | { kind: "any_of"; values: string[] }
  | { kind: "below"; value: number }
  | { kind: "above"; value: number };

export type ScreeningOption = { value: string; label: string };

export type ScreeningDraft = {
  /** Client-only key for React lists. */
  key: string;
  id?: string;
  question: string;
  helpText: string;
  type: ScreeningType;
  /** Choice labels as typed; values are derived when serialising. */
  optionLabels: string[];
  isRequired: boolean;
  knockout: KnockoutRule | null;
};

/** Stable machine value for a choice label ("Yes, 5+ years" → "yes-5-years"), unique within the question. */
export function optionValue(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "option";
  let value = base;
  let n = 2;
  while (taken.has(value)) value = `${base}-${n++}`;
  return value;
}

export function draftOptions(labels: readonly string[]): ScreeningOption[] {
  const taken = new Set<string>();
  const out: ScreeningOption[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const value = optionValue(label, taken);
    taken.add(value);
    out.push({ value, label });
  }
  return out;
}

const isChoice = (t: ScreeningType) => t === "single_choice" || t === "multi_choice";

/** Keep only a rule that fits the answer type (otherwise the server would reject the question). */
export function fitKnockout(type: ScreeningType, rule: KnockoutRule | null, options: readonly ScreeningOption[]): KnockoutRule | null {
  if (!rule) return null;
  if (type === "yes_no") return rule.kind === "equals" && typeof rule.value === "boolean" ? rule : null;
  if (type === "number") {
    if ((rule.kind === "below" || rule.kind === "above") && Number.isFinite(rule.value)) return rule;
    return null;
  }
  if (isChoice(type) && rule.kind === "any_of") {
    const values = rule.values.filter((v) => options.some((o) => o.value === v));
    return values.length ? { kind: "any_of", values } : null;
  }
  return null;
}

export function serializeQuestions(drafts: readonly ScreeningDraft[]) {
  return drafts.map((d) => {
    const options = isChoice(d.type) ? draftOptions(d.optionLabels) : [];
    return {
      ...(d.id ? { id: d.id } : {}),
      question: d.question.trim(),
      helpText: d.helpText.trim() || null,
      type: d.type,
      options,
      isRequired: d.isRequired,
      knockout: fitKnockout(d.type, d.knockout, options),
    };
  });
}

/** Choice labels selected by an any_of rule, mapped back from stored values (for editing). */
export function knockoutLabels(rule: KnockoutRule | null, options: readonly ScreeningOption[]): string[] {
  if (!rule || rule.kind !== "any_of") return [];
  return options.filter((o) => rule.values.includes(o.value)).map((o) => o.label);
}

/** Rebuild an any_of rule from selected labels after the labels changed. */
export function anyOfFromLabels(selectedLabels: readonly string[], labels: readonly string[]): KnockoutRule | null {
  const options = draftOptions(labels);
  const values = options.filter((o) => selectedLabels.includes(o.label)).map((o) => o.value);
  return values.length ? { kind: "any_of", values } : null;
}

/** First error message for a JSON list field (keys like "screeningQuestions.0.question"). */
export function listErrors(fieldErrors: Record<string, string[]> | undefined, prefix: string): { index: number | null; message: string }[] {
  if (!fieldErrors) return [];
  const out: { index: number | null; message: string }[] = [];
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (key !== prefix && !key.startsWith(`${prefix}.`)) continue;
    const match = /^[^.]+\.(\d+)/.exec(key);
    out.push({ index: match ? Number(match[1]) : null, message: messages[0] ?? "Check this item" });
  }
  return out;
}

/** Editor draft from a stored question; any_of rules are re-derived from labels so values stay consistent. */
export function toScreeningDraft(q: {
  id: string;
  question: string;
  helpText: string | null;
  type: ScreeningType;
  options: ScreeningOption[];
  isRequired: boolean;
  knockout: KnockoutRule | null;
}): ScreeningDraft {
  const optionLabels = q.options.map((o) => o.label);
  const knockout = q.knockout?.kind === "any_of" ? anyOfFromLabels(knockoutLabels(q.knockout, q.options), optionLabels) : q.knockout;
  return { key: q.id, id: q.id, question: q.question, helpText: q.helpText ?? "", type: q.type, optionLabels, isRequired: q.isRequired, knockout };
}
