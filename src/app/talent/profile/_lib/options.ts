import type { SelectOption } from "@/components/shared/types";
import type { TFunction } from "@/i18n/server";
import type { CandidateProfileDetail } from "@/modules/candidates/types";

/** Taxonomy options loaded once by the profile page and handed to the section editors. */
export type ProfileOptions = {
  countries: SelectOption[];
  currencies: SelectOption[];
  industries: SelectOption[];
  categories: SelectOption[];
  languages: SelectOption[];
  levels: SelectOption[];
  qualificationTypes: SelectOption[];
};

export type SectionProps = {
  t: TFunction;
  /** Intl locale (en-IN / hi-IN / te-IN). */
  loc: string;
  detail: CandidateProfileDetail & { suggestedExperienceMonths: number };
  options: ProfileOptions;
};
