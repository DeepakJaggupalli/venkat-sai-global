import "server-only";

import type { StaffFieldSpec } from "@/app/admin/pipeline/_shared/staff-form";
import type { CourseRow } from "@/modules/training/types";
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  COURSE_CERTIFICATION_TYPES,
  COURSE_CERTIFICATION_TYPE_LABELS,
  COURSE_FEE_TYPES,
  COURSE_FEE_TYPE_LABELS,
  COURSE_MODES,
  COURSE_MODE_LABELS,
} from "@/modules/training/constants";
import { currencyOptions, listLanguages } from "@/modules/taxonomy/queries";
import { fromMinorUnits } from "@/lib/format";

/**
 * Field specs for Venkat Sai's own course form (create and edit). Fees are entered as decimals in the
 * chosen currency; the module converts to minor units. Certification wording follows CONVENTIONS §15:
 * Venkat Sai results are assessments, never accredited qualifications.
 */
export async function courseFields(course?: CourseRow | null): Promise<StaffFieldSpec[]> {
  const [currencies, languages] = await Promise.all([currencyOptions(), listLanguages()]);
  const languageOptions = languages.map((l) => ({ value: l.code, label: l.name }));
  const feeAmount = course?.feeMinor != null && course.feeCurrency ? fromMinorUnits(course.feeMinor, course.feeCurrency) : null;
  return [
    { name: "title", label: "Course title", required: true, defaultValue: course?.title, wide: true, maxLength: 200 },
    { name: "summary", label: "Summary", kind: "textarea", optional: true, rows: 2, defaultValue: course?.summary, hint: "One or two sentences for the catalogue card.", maxLength: 500 },
    { name: "descriptionHtml", label: "Description", kind: "richtext", optional: true, defaultValue: course?.descriptionHtml },
    { name: "category", label: "Category", kind: "select", required: true, options: COURSE_CATEGORIES.map((v) => ({ value: v, label: COURSE_CATEGORY_LABELS[v] })), defaultValue: course?.category },
    { name: "mode", label: "Delivery", kind: "select", required: true, options: COURSE_MODES.map((v) => ({ value: v, label: COURSE_MODE_LABELS[v] })), defaultValue: course?.mode ?? "in_person" },
    { name: "durationHours", label: "Duration (hours)", kind: "number", optional: true, min: 1, defaultValue: course?.durationHours },
    { name: "durationWeeks", label: "Duration (weeks)", kind: "number", optional: true, min: 1, defaultValue: course?.durationWeeks },
    { name: "languageCodes", label: "Language of instruction", kind: "search-select", optional: true, options: languageOptions, defaultValue: course?.languageCodes?.[0] ?? null, allowClear: true },
    { name: "certificationType", label: "What learners can earn", kind: "select", required: true, options: COURSE_CERTIFICATION_TYPES.filter((v) => v !== "accredited_external").map((v) => ({ value: v, label: COURSE_CERTIFICATION_TYPE_LABELS[v] })), defaultValue: course?.certificationType === "accredited_external" ? null : (course?.certificationType ?? "none"), hint: "Venkat Sai certificates record an assessment or training result. They are not external accreditations." },
    { name: "eligibility", label: "Eligibility", kind: "textarea", optional: true, rows: 2, defaultValue: course?.eligibility },
    { name: "prerequisites", label: "Prerequisites", kind: "textarea", optional: true, rows: 2, defaultValue: course?.prerequisites },
    { name: "outcomes", label: "Learning outcomes", kind: "tags", optional: true, defaultTags: course?.outcomes ?? [], hint: "Press Enter after each outcome.", wide: true },
    { name: "feeType", label: "Fee", kind: "select", required: true, options: COURSE_FEE_TYPES.map((v) => ({ value: v, label: COURSE_FEE_TYPE_LABELS[v] })), defaultValue: course?.feeType ?? "on_request", hint: "Course fees are never a condition of a job application, offer or placement." },
    { name: "feeAmount", label: "Fee amount", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: feeAmount, hint: "Only for a fixed fee." },
    { name: "feeCurrency", label: "Fee currency", kind: "search-select", optional: true, options: currencies, defaultValue: course?.feeCurrency, allowClear: true },
    { name: "feeNotes", label: "Fee notes", optional: true, defaultValue: course?.feeNotes, maxLength: 500 },
  ];
}
