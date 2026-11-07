import "server-only";

import { isFeatureEnabled } from "@/modules/settings";
import { countryOptions, currencyOptions, industryOptions, jobCategoryOptions, listEducationLevels } from "@/modules/taxonomy/queries";

import type { JobFilterOptions } from "./filter-panel";

/**
 * Option lists for the job search filters (taxonomy tables, administered in the database). Loaded once
 * per request by the public /jobs page and the People Portal discovery page.
 */
export async function loadJobFilterOptions(): Promise<JobFilterOptions> {
  const [categories, industries, countries, currencies, educationLevels, overseasEnabled] = await Promise.all([
    jobCategoryOptions(),
    industryOptions(),
    countryOptions(),
    currencyOptions(),
    listEducationLevels(),
    isFeatureEnabled("talent.overseas").catch(() => true),
  ]);
  return {
    categories,
    industries,
    countries,
    currencies,
    educationLevels: educationLevels.map((level) => ({ value: level.id, label: level.name })),
    overseasEnabled,
  };
}
