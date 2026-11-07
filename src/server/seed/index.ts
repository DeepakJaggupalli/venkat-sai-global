import "server-only";

import { seedFirstSuperAdmin } from "./admin";
import { seedCountries } from "./countries";
import { seedCurrencies } from "./currencies";
import { seedEducationLevels, seedQualificationTypes } from "./education";
import { seedIndiaStates } from "./india-states";
import { seedIndustries } from "./industries";
import { seedJobCategories } from "./job-categories";
import { seedLanguages } from "./languages";
import { seedRoles } from "./roles";
import { seedSkills } from "./skills";
import type { SeedResult } from "./util";

export type { SeedResult } from "./util";

/**
 * Production reference-data seed (idempotent; safe to run on every deploy).
 * Order respects foreign keys: currencies → countries → states; industries → job categories;
 * roles → first Super Admin. Each step inserts missing rows by natural key and never overwrites
 * data an administrator may have edited.
 */
export const REFERENCE_SEEDS: readonly { name: string; run: () => Promise<SeedResult> }[] = [
  { name: "currencies", run: seedCurrencies },
  { name: "countries", run: seedCountries },
  { name: "states", run: seedIndiaStates },
  { name: "languages", run: seedLanguages },
  { name: "industries", run: seedIndustries },
  { name: "job categories", run: seedJobCategories },
  { name: "skills", run: seedSkills },
  { name: "education levels", run: seedEducationLevels },
  { name: "qualification types", run: seedQualificationTypes },
  { name: "roles", run: seedRoles },
  { name: "super admin", run: seedFirstSuperAdmin },
];

export async function runReferenceSeeds(onResult?: (result: SeedResult) => void): Promise<SeedResult[]> {
  const results: SeedResult[] = [];
  for (const step of REFERENCE_SEEDS) {
    const result = await step.run();
    results.push(result);
    onResult?.(result);
  }
  return results;
}
