/**
 * Repeatable role lines of the workforce requirement form (pure, client-safe).
 * The form keeps every input as a string; `buildRequirementPayload` turns the rows into the `lines:json`
 * payload validated by `requirementLineSchema` in the operations module (the server re-validates everything).
 */

export type RequirementLineDraft = {
  key: string;
  roleTitle: string;
  positions: string;
  experienceMinYears: string;
  experienceMaxYears: string;
  qualification: string;
  requiredSkills: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: string;
  notes: string;
};

export const MAX_REQUIREMENT_LINES = 50;

export function emptyLine(key: string): RequirementLineDraft {
  return {
    key,
    roleTitle: "",
    positions: "",
    experienceMinYears: "",
    experienceMaxYears: "",
    qualification: "",
    requiredSkills: "",
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: "",
    salaryPeriod: "",
    notes: "",
  };
}

function isBlank(line: RequirementLineDraft): boolean {
  return Object.entries(line).every(([k, v]) => k === "key" || v.trim() === "");
}

function num(value: string): number | undefined {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export type RequirementLinePayload = Record<string, string | number | string[]>;

export function buildRequirementPayload(lines: readonly RequirementLineDraft[]): RequirementLinePayload[] {
  return lines
    .filter((line) => !isBlank(line))
    .map((line) => {
      const out: RequirementLinePayload = {
        roleTitle: line.roleTitle.trim(),
        // Keep an unparsable value as text so the server reports it against the field.
        positions: num(line.positions) ?? line.positions.trim(),
        requiredSkills: line.requiredSkills
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 30),
      };
      const optionalNumbers = ["experienceMinYears", "experienceMaxYears", "salaryMin", "salaryMax"] as const;
      for (const key of optionalNumbers) {
        const value = num(line[key]);
        if (value !== undefined) out[key] = value;
      }
      if (line.qualification.trim()) out.qualification = line.qualification.trim();
      if (line.salaryCurrency.trim()) out.salaryCurrency = line.salaryCurrency.trim().toUpperCase();
      if (line.salaryPeriod.trim()) out.salaryPeriod = line.salaryPeriod.trim();
      if (line.notes.trim()) out.notes = line.notes.trim();
      return out;
    });
}

/** Field errors from the server come back as `lines.<index>.<field>`; map them to a row of the visible form. */
export function lineErrors(fieldErrors: Record<string, string[]> | undefined, lines: readonly RequirementLineDraft[], key: string): Record<string, string[]> {
  if (!fieldErrors) return {};
  // Indexes refer to the payload (blank rows removed), so translate the row key into its payload index.
  let payloadIndex = -1;
  let index = 0;
  for (const line of lines) {
    if (isBlank(line)) continue;
    if (line.key === key) {
      payloadIndex = index;
      break;
    }
    index += 1;
  }
  if (payloadIndex < 0) return {};
  const prefix = `lines.${payloadIndex}.`;
  const out: Record<string, string[]> = {};
  for (const [name, messages] of Object.entries(fieldErrors)) {
    if (name.startsWith(prefix)) out[name.slice(prefix.length)] = messages;
  }
  return out;
}

const LINE_FIELD_LABELS: Record<string, string> = {
  roleTitle: "role or trade",
  positions: "number of positions",
  experienceMinYears: "minimum experience",
  experienceMaxYears: "maximum experience",
  qualification: "qualification",
  requiredSkills: "required skills",
  salaryMin: "salary from",
  salaryMax: "salary to",
  salaryCurrency: "currency",
  salaryPeriod: "salary period",
  notes: "notes",
};

/**
 * Labels for the error summary, so a role-line message names its row ("Role 2, number of positions: Enter 1 or
 * more") instead of standing alone. Keys are the server's `lines.<payload index>.<field>`; the label uses the row
 * number the visitor sees (blank rows are left out of the payload, so the two can differ).
 */
export function lineFieldLabels(lines: readonly RequirementLineDraft[]): Record<string, string> {
  const out: Record<string, string> = {};
  let payloadIndex = 0;
  lines.forEach((line, row) => {
    if (isBlank(line)) return;
    for (const [field, label] of Object.entries(LINE_FIELD_LABELS)) out[`lines.${payloadIndex}.${field}`] = `Role ${row + 1}, ${label}`;
    payloadIndex += 1;
  });
  return out;
}
