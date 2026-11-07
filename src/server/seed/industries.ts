import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { industries } from "@/db/schema";

import { assertUnique, countInserted, type SeedResult } from "./util";

/** The 20 industries served by the platform (product specification). Descriptions are neutral definitions. */
export const INDUSTRIES: readonly { slug: string; name: string; description: string }[] = [
  { slug: "oil-and-gas", name: "Oil and gas", description: "Exploration, production, refining, pipelines and distribution of oil and gas." },
  { slug: "construction", name: "Construction", description: "Building, civil works and site trades for residential, commercial and industrial projects." },
  { slug: "engineering", name: "Engineering", description: "Design, engineering services and project delivery across disciplines." },
  { slug: "shipbuilding", name: "Shipbuilding", description: "Construction, conversion and repair of ships and marine vessels." },
  { slug: "offshore", name: "Offshore", description: "Offshore platforms, rigs and marine operations." },
  { slug: "manufacturing", name: "Manufacturing", description: "Production of goods in factories and processing plants." },
  { slug: "fabrication", name: "Fabrication", description: "Metal fabrication, welding and assembly of structures, piping and equipment." },
  { slug: "power-and-energy", name: "Power and energy", description: "Power generation, transmission, distribution and renewable energy." },
  { slug: "infrastructure", name: "Infrastructure", description: "Roads, rail, bridges, ports, airports, water and utilities." },
  { slug: "automotive", name: "Automotive", description: "Vehicle manufacturing, servicing and repair." },
  { slug: "logistics", name: "Logistics", description: "Transport, warehousing, freight and supply chain operations." },
  { slug: "hospitality", name: "Hospitality", description: "Hotels, restaurants, catering and food services." },
  { slug: "healthcare", name: "Healthcare", description: "Hospitals, clinics, care homes, laboratories and allied health." },
  { slug: "it-and-technology", name: "IT and technology", description: "Software, IT services, infrastructure and digital products." },
  { slug: "banking-and-finance", name: "Banking and finance", description: "Banking, insurance, accounting and financial services." },
  { slug: "education", name: "Education", description: "Schools, colleges, universities and training providers." },
  { slug: "telecommunications", name: "Telecommunications", description: "Mobile, fixed-line and data networks and their installation and maintenance." },
  { slug: "facility-management", name: "Facility management", description: "Building operations, maintenance, cleaning and support services." },
  { slug: "industrial-maintenance", name: "Industrial maintenance", description: "Maintenance, shutdowns and repair of plants, machinery and equipment." },
  { slug: "mining", name: "Mining", description: "Extraction and processing of minerals, metals and aggregates." },
];

export async function seedIndustries(): Promise<SeedResult> {
  assertUnique(INDUSTRIES, (i) => i.slug, "industry slug");
  const rows = await db
    .insert(industries)
    .values(INDUSTRIES.map((i, index) => ({ ...i, isActive: true, sortOrder: (index + 1) * 10 })))
    .onConflictDoUpdate({
      target: industries.slug,
      set: { description: sql`excluded.description` },
      setWhere: sql`${industries.description} is null`,
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { name: "industries", ...countInserted(rows), total: INDUSTRIES.length };
}
