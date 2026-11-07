import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { industries, jobCategories } from "@/db/schema";

import { INDUSTRIES } from "./industries";
import { assertUnique, countInserted, type SeedResult } from "./util";

/**
 * Trades and professions used for jobs, requirements and candidate preferences, grouped by the
 * industry where they are most common (a category can still be used in any industry).
 * `parent` builds a two-level tree (e.g. the welding processes under "Welder").
 */
type CategorySeed = { slug: string; name: string; industry: string; parent?: string };

export const JOB_CATEGORIES: readonly CategorySeed[] = [
  // Welding & fabrication
  { slug: "welder", name: "Welder", industry: "fabrication" },
  { slug: "welder-smaw", name: "Welder (SMAW / stick)", industry: "fabrication", parent: "welder" },
  { slug: "welder-tig-gtaw", name: "Welder (TIG / GTAW)", industry: "fabrication", parent: "welder" },
  { slug: "welder-mig-mag-gmaw", name: "Welder (MIG / MAG / GMAW)", industry: "fabrication", parent: "welder" },
  { slug: "welder-fcaw", name: "Welder (FCAW)", industry: "fabrication", parent: "welder" },
  { slug: "pipe-welder", name: "Pipe welder", industry: "fabrication", parent: "welder" },
  { slug: "structural-welder", name: "Structural welder", industry: "fabrication", parent: "welder" },
  { slug: "fabricator", name: "Fabricator", industry: "fabrication" },
  { slug: "pipe-fitter", name: "Pipe fitter", industry: "fabrication" },
  { slug: "structural-fitter", name: "Structural fitter", industry: "fabrication" },
  { slug: "sheet-metal-worker", name: "Sheet metal worker", industry: "fabrication" },
  { slug: "grinder-gas-cutter", name: "Grinder / gas cutter", industry: "fabrication" },

  // Construction & site trades
  { slug: "rigger", name: "Rigger", industry: "construction" },
  { slug: "scaffolder", name: "Scaffolder", industry: "construction" },
  { slug: "mason", name: "Mason", industry: "construction" },
  { slug: "carpenter", name: "Carpenter", industry: "construction" },
  { slug: "shuttering-carpenter", name: "Shuttering carpenter (formwork)", industry: "construction", parent: "carpenter" },
  { slug: "steel-fixer", name: "Steel fixer", industry: "construction" },
  { slug: "painter-blaster", name: "Painter / blaster", industry: "construction" },
  { slug: "plumber", name: "Plumber", industry: "construction" },
  { slug: "tiler", name: "Tile setter", industry: "construction" },
  { slug: "general-helper", name: "General helper / labourer", industry: "construction" },
  { slug: "site-supervisor-foreman", name: "Site supervisor / foreman", industry: "construction" },
  { slug: "heavy-equipment-operator", name: "Heavy equipment operator", industry: "construction" },
  { slug: "crane-operator", name: "Crane operator", industry: "construction" },
  { slug: "civil-engineer", name: "Civil engineer", industry: "construction" },
  { slug: "quantity-surveyor", name: "Quantity surveyor", industry: "construction" },
  { slug: "land-surveyor", name: "Land surveyor", industry: "infrastructure" },
  { slug: "draughtsman-cad", name: "Draughtsman / CAD technician", industry: "engineering" },

  // Mechanical & maintenance
  { slug: "millwright", name: "Millwright", industry: "industrial-maintenance" },
  { slug: "machinist", name: "Machinist", industry: "manufacturing" },
  { slug: "cnc-operator", name: "CNC operator", industry: "manufacturing" },
  { slug: "mechanical-fitter", name: "Mechanical fitter / technician", industry: "industrial-maintenance" },
  { slug: "insulator", name: "Insulator", industry: "industrial-maintenance" },
  { slug: "mechanical-engineer", name: "Mechanical engineer", industry: "engineering" },
  { slug: "piping-engineer", name: "Piping engineer", industry: "engineering" },
  { slug: "project-manager", name: "Project manager", industry: "engineering" },
  { slug: "planner", name: "Planning engineer / planner", industry: "engineering" },
  { slug: "production-operator", name: "Production / machine operator", industry: "manufacturing" },

  // Electrical & instrumentation
  { slug: "electrician", name: "Electrician", industry: "power-and-energy" },
  { slug: "electrician-industrial", name: "Electrician (industrial)", industry: "power-and-energy", parent: "electrician" },
  { slug: "electrician-building", name: "Electrician (building)", industry: "construction", parent: "electrician" },
  { slug: "electrician-high-voltage", name: "Electrician (high voltage)", industry: "power-and-energy", parent: "electrician" },
  { slug: "instrument-technician", name: "Instrument technician", industry: "oil-and-gas" },
  { slug: "electrical-engineer", name: "Electrical engineer", industry: "engineering" },
  { slug: "hvac-technician", name: "HVAC technician", industry: "facility-management" },
  { slug: "solar-pv-technician", name: "Solar PV technician", industry: "power-and-energy" },
  { slug: "lineman", name: "Lineman (transmission and distribution)", industry: "power-and-energy" },
  { slug: "mep-technician", name: "MEP maintenance technician", industry: "facility-management" },

  // Quality, inspection & safety
  { slug: "qa-qc-inspector", name: "QA/QC inspector", industry: "oil-and-gas" },
  { slug: "welding-inspector", name: "Welding inspector", industry: "fabrication" },
  { slug: "ndt-technician", name: "NDT technician", industry: "oil-and-gas" },
  { slug: "hse-safety-officer", name: "HSE / safety officer", industry: "construction" },
  { slug: "process-operator", name: "Process operator (oil and gas)", industry: "oil-and-gas" },
  { slug: "roustabout", name: "Roustabout / deckhand", industry: "offshore" },
  { slug: "ship-fitter", name: "Ship fitter", industry: "shipbuilding" },
  { slug: "marine-electrician", name: "Marine electrician", industry: "shipbuilding" },
  { slug: "mining-machine-operator", name: "Mining machine operator", industry: "mining" },

  // Transport, automotive & logistics
  { slug: "driver", name: "Driver", industry: "logistics" },
  { slug: "driver-light-vehicle", name: "Driver (light vehicle)", industry: "logistics", parent: "driver" },
  { slug: "driver-heavy-vehicle", name: "Driver (heavy vehicle)", industry: "logistics", parent: "driver" },
  { slug: "driver-bus", name: "Driver (bus)", industry: "logistics", parent: "driver" },
  { slug: "forklift-operator", name: "Forklift operator", industry: "logistics" },
  { slug: "mechanic", name: "Mechanic", industry: "automotive" },
  { slug: "diesel-mechanic", name: "Mechanic (diesel)", industry: "automotive", parent: "mechanic" },
  { slug: "automotive-mechanic", name: "Mechanic (automotive)", industry: "automotive", parent: "mechanic" },
  { slug: "heavy-equipment-mechanic", name: "Mechanic (heavy equipment)", industry: "automotive", parent: "mechanic" },
  { slug: "auto-electrician", name: "Auto electrician", industry: "automotive" },
  { slug: "warehouse-associate", name: "Warehouse associate", industry: "logistics" },
  { slug: "storekeeper", name: "Storekeeper", industry: "logistics" },
  { slug: "logistics-coordinator", name: "Logistics coordinator", industry: "logistics" },

  // Healthcare
  { slug: "nurse", name: "Nurse", industry: "healthcare" },
  { slug: "caregiver", name: "Caregiver", industry: "healthcare" },
  { slug: "lab-technician", name: "Lab technician", industry: "healthcare" },
  { slug: "pharmacist", name: "Pharmacist", industry: "healthcare" },

  // Hospitality
  { slug: "chef-cook", name: "Chef / cook", industry: "hospitality" },
  { slug: "housekeeping", name: "Housekeeping attendant", industry: "hospitality" },
  { slug: "front-office", name: "Front office executive", industry: "hospitality" },
  { slug: "waiter-steward", name: "Waiter / steward", industry: "hospitality" },

  // IT, telecom & office
  { slug: "software-developer", name: "Software developer", industry: "it-and-technology" },
  { slug: "it-support", name: "IT support technician", industry: "it-and-technology" },
  { slug: "data-analyst", name: "Data analyst", industry: "it-and-technology" },
  { slug: "network-engineer", name: "Network engineer", industry: "telecommunications" },
  { slug: "telecom-technician", name: "Telecom technician", industry: "telecommunications" },
  { slug: "accountant", name: "Accountant", industry: "banking-and-finance" },
  { slug: "hr-executive", name: "HR executive", industry: "banking-and-finance" },
  { slug: "sales-executive", name: "Sales executive", industry: "banking-and-finance" },
  { slug: "customer-service", name: "Customer service executive", industry: "banking-and-finance" },
  { slug: "office-administrator", name: "Office administrator", industry: "facility-management" },

  // Education
  { slug: "teacher-trainer", name: "Teacher / trainer", industry: "education" },
  { slug: "welding-instructor", name: "Welding instructor", industry: "education" },
];

export async function seedJobCategories(): Promise<SeedResult> {
  assertUnique(JOB_CATEGORIES, (c) => c.slug, "job category slug");
  const industrySlugs = new Set(INDUSTRIES.map((i) => i.slug));
  for (const c of JOB_CATEGORIES) {
    if (!industrySlugs.has(c.industry)) throw new Error(`Job category ${c.slug} references unknown industry ${c.industry}`);
    if (c.parent && !JOB_CATEGORIES.some((p) => p.slug === c.parent && !p.parent)) throw new Error(`Job category ${c.slug} has an invalid parent ${c.parent}`);
  }

  const industryRows = await db.select({ id: industries.id, slug: industries.slug }).from(industries);
  const industryId = new Map(industryRows.map((r) => [r.slug, r.id]));

  const values = (list: readonly CategorySeed[], parentId: Map<string, string>) =>
    list.map((c) => ({
      slug: c.slug,
      name: c.name,
      industryId: industryId.get(c.industry) ?? null,
      parentId: c.parent ? (parentId.get(c.parent) ?? null) : null,
      isActive: true,
      sortOrder: (JOB_CATEGORIES.indexOf(c) + 1) * 10,
    }));

  const upsert = (rowsToInsert: ReturnType<typeof values>) =>
    db
      .insert(jobCategories)
      .values(rowsToInsert)
      .onConflictDoUpdate({
        target: jobCategories.slug,
        // Fill gaps only (admins may have re-parented or re-assigned categories).
        set: {
          industryId: sql`coalesce(${jobCategories.industryId}, excluded.industry_id)`,
          parentId: sql`coalesce(${jobCategories.parentId}, excluded.parent_id)`,
        },
        setWhere: sql`(${jobCategories.industryId} is null and excluded.industry_id is not null) or (${jobCategories.parentId} is null and excluded.parent_id is not null)`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });

  // Parents first, then children (they need the parents' ids).
  const parents = JOB_CATEGORIES.filter((c) => !c.parent);
  const children = JOB_CATEGORIES.filter((c) => c.parent);
  const parentRows = await upsert(values(parents, new Map()));
  const allParents = await db.select({ id: jobCategories.id, slug: jobCategories.slug }).from(jobCategories);
  const parentId = new Map(allParents.map((r) => [r.slug, r.id]));
  const childRows = children.length ? await upsert(values(children, parentId)) : [];

  const counts = countInserted([...parentRows, ...childRows]);
  return { name: "job categories", ...counts, total: JOB_CATEGORIES.length };
}
