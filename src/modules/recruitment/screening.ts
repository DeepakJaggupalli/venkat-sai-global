/**
 * Screening answers: validation against a job's questions and knockout evaluation (pure).
 *
 * Knockout rules only FLAG an application for human review — they never reject it automatically
 * (docs/DATA_MODEL.md, jobs.job_screening_questions).
 */
import type { ScreeningAnswerValue, ScreeningKnockoutRule, ScreeningQuestionOption, ScreeningQuestionType } from "@/db/schema/jobs";
import type { ApplicationKnockoutFlag, ScreeningQuestionSnapshot } from "@/db/schema/recruitment";

export const MAX_TEXT_ANSWER_LENGTH = 2000;

export type ScreeningQuestionInput = {
  id: string;
  question: string;
  type: ScreeningQuestionType;
  options: ScreeningQuestionOption[];
  isRequired: boolean;
  knockoutAnswer: ScreeningKnockoutRule | null;
};

export type ValidatedAnswer = {
  questionId: string;
  answer: ScreeningAnswerValue;
  questionSnapshot: ScreeningQuestionSnapshot;
  isFlagged: boolean;
  flagReason: string | null;
};

export type ScreeningValidation = {
  answers: ValidatedAnswer[];
  knockoutFlags: ApplicationKnockoutFlag[];
  /** questionId → message (empty when valid). */
  errors: Record<string, string>;
};

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "yes" || value === "1" || value === 1) return true;
  if (value === "false" || value === "no" || value === "0" || value === 0) return false;
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce a raw answer to the question's type, or return an error message. */
export function coerceAnswer(question: Pick<ScreeningQuestionInput, "type" | "options">, raw: unknown): { ok: true; value: ScreeningAnswerValue } | { ok: false; error: string } {
  const optionValues = new Set(question.options.map((o) => o.value));
  switch (question.type) {
    case "text": {
      if (typeof raw !== "string") return { ok: false, error: "Enter an answer." };
      const value = raw.trim();
      if (value.length > MAX_TEXT_ANSWER_LENGTH) return { ok: false, error: `Keep the answer under ${MAX_TEXT_ANSWER_LENGTH} characters.` };
      return { ok: true, value };
    }
    case "yes_no": {
      const value = toBoolean(raw);
      return value === null ? { ok: false, error: "Choose yes or no." } : { ok: true, value };
    }
    case "number": {
      const value = toNumber(raw);
      return value === null ? { ok: false, error: "Enter a number." } : { ok: true, value };
    }
    case "single_choice": {
      if (typeof raw !== "string" || !optionValues.has(raw)) return { ok: false, error: "Choose one of the options." };
      return { ok: true, value: raw };
    }
    case "multi_choice": {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : null;
      if (!list || list.some((v) => typeof v !== "string" || !optionValues.has(v))) return { ok: false, error: "Choose from the options." };
      return { ok: true, value: [...new Set(list as string[])] };
    }
  }
}

/** Does `answer` match the knockout rule? Returns the human-readable reason when it does. */
export function evaluateKnockout(rule: ScreeningKnockoutRule | null | undefined, answer: ScreeningAnswerValue): string | null {
  if (!rule) return null;
  switch (rule.kind) {
    case "equals":
      if (typeof answer === "number" && typeof rule.value === "number") return answer === rule.value ? `Answer is ${rule.value}` : null;
      if (typeof answer === "boolean") return answer === toBoolean(rule.value) ? `Answer is ${answer ? "yes" : "no"}` : null;
      if (typeof answer === "string") return answer.trim().toLowerCase() === String(rule.value).trim().toLowerCase() ? `Answer is "${answer}"` : null;
      return null;
    case "any_of": {
      const values = new Set(rule.values);
      if (Array.isArray(answer)) {
        const hit = answer.find((a) => values.has(a));
        return hit !== undefined ? `Includes "${hit}"` : null;
      }
      return typeof answer === "string" && values.has(answer) ? `Answer is "${answer}"` : null;
    }
    case "below":
      return typeof answer === "number" && answer < rule.value ? `Below ${rule.value}` : null;
    case "above":
      return typeof answer === "number" && answer > rule.value ? `Above ${rule.value}` : null;
  }
}

/**
 * Validate answers for a job's questions.
 *  - `requireMandatory` (candidate applications): required questions must be answered.
 *    Staff assignments and partner submissions pass false — nobody answers on a candidate's behalf.
 *  - Answers to unknown questions are ignored; blank optional answers are skipped.
 */
export function validateScreeningAnswers(
  questions: readonly ScreeningQuestionInput[],
  rawAnswers: Readonly<Record<string, unknown>>,
  opts: { requireMandatory: boolean },
): ScreeningValidation {
  const answers: ValidatedAnswer[] = [];
  const knockoutFlags: ApplicationKnockoutFlag[] = [];
  const errors: Record<string, string> = {};

  for (const question of questions) {
    const raw = rawAnswers[question.id];
    if (isBlank(raw)) {
      if (question.isRequired && opts.requireMandatory) errors[question.id] = "This question needs an answer.";
      continue;
    }
    const coerced = coerceAnswer(question, raw);
    if (!coerced.ok) {
      errors[question.id] = coerced.error;
      continue;
    }
    const flagReason = evaluateKnockout(question.knockoutAnswer, coerced.value);
    answers.push({
      questionId: question.id,
      answer: coerced.value,
      questionSnapshot: { question: question.question, type: question.type, options: question.options, isRequired: question.isRequired },
      isFlagged: flagReason !== null,
      flagReason,
    });
    if (flagReason !== null) {
      knockoutFlags.push({ questionId: question.id, question: question.question, answer: coerced.value, reason: flagReason });
    }
  }
  return { answers, knockoutFlags, errors };
}
