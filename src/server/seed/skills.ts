import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { skills } from "@/db/schema";
import type { SkillCategory } from "@/db/schema/_constants";
import { slugify } from "@/lib/http";

import { assertUnique, chunk, countInserted, type SeedResult } from "./util";

/**
 * Curated skills (status "approved") across SKILL_CATEGORIES, with synonyms used by the skill
 * typeahead (searchSkills matches names and synonyms). Tuple: [name, synonyms?, slug override?].
 * Healthcare, hospitality and office skills are filed under the closest category
 * (technical / trade / soft) because the category list is fixed.
 */
type SkillTuple = readonly [name: string, synonyms?: readonly string[], slug?: string];

const TRADE: readonly SkillTuple[] = [
  // Welding processes
  ["Shielded metal arc welding (SMAW)", ["SMAW", "stick welding", "arc welding", "MMA welding"]],
  ["Gas tungsten arc welding (GTAW)", ["GTAW", "TIG welding", "argon welding"]],
  ["Gas metal arc welding (GMAW)", ["GMAW", "MIG welding", "MAG welding", "CO2 welding"]],
  ["Flux-cored arc welding (FCAW)", ["FCAW", "flux core welding"]],
  ["Submerged arc welding (SAW)", ["SAW"]],
  ["Oxy-fuel welding and cutting", ["gas welding", "oxy-acetylene", "gas cutting"]],
  ["Plasma arc cutting", ["plasma cutting"]],
  ["Orbital welding", ["orbital TIG"]],
  ["Stud welding"],
  ["Resistance spot welding", ["spot welding", "resistance welding"]],
  ["Brazing and soldering", ["brazing", "soldering"]],
  ["Arc gouging", ["carbon arc gouging", "back gouging"]],
  // Welding positions
  ["1G welding (flat groove)", ["1G"]],
  ["2G welding (horizontal groove)", ["2G"]],
  ["3G welding (vertical groove)", ["3G"]],
  ["4G welding (overhead groove)", ["4G"]],
  ["5G pipe welding", ["5G"]],
  ["6G pipe welding", ["6G", "pipe 6G"]],
  ["6GR pipe welding (restricted access)", ["6GR"]],
  ["1F fillet welding (flat)", ["1F"]],
  ["2F fillet welding (horizontal)", ["2F"]],
  ["3F fillet welding (vertical)", ["3F"]],
  ["4F fillet welding (overhead)", ["4F"]],
  // Materials
  ["Carbon steel welding", ["CS welding", "mild steel welding"]],
  ["Stainless steel welding", ["SS welding"]],
  ["Aluminium welding", ["aluminum welding"]],
  ["Duplex stainless steel welding", ["duplex welding", "super duplex welding"]],
  ["Chrome-moly steel welding", ["P91", "P22", "Cr-Mo welding", "alloy steel welding"]],
  ["Nickel alloy welding", ["Inconel welding"]],
  ["Copper-nickel welding", ["CuNi welding"]],
  ["Cast iron welding"],
  // Fabrication & piping
  ["Blueprint reading", ["drawing reading", "technical drawing reading"]],
  ["Isometric drawing reading", ["isometrics", "piping isometrics"]],
  ["WPS and PQR familiarity", ["WPS", "PQR", "welding procedure specification"]],
  ["Weld joint preparation", ["bevelling", "edge preparation"]],
  ["Fit-up and tack welding", ["fit up", "tacking"]],
  ["Structural steel fabrication", ["structural fabrication"]],
  ["Pipe spool fabrication", ["spool fabrication", "pipe fabrication"]],
  ["Sheet metal fabrication", ["sheet metal work"]],
  ["Plate rolling and bending"],
  ["Grinding and finishing", ["grinding"]],
  ["Structural steel erection", ["steel erection"]],
  ["Pipe fitting", ["pipefitting"]],
  ["Flange management and bolt torquing", ["bolt torquing", "bolt tightening", "flange joint assembly"]],
  ["Hydrostatic testing", ["hydrotest", "pressure testing"]],
  ["Pipe support installation"],
  // Rigging & scaffolding
  ["Rigging", ["rigger"]],
  ["Slinging and signalling", ["banksman", "signalman", "crane signalling"]],
  ["Lift planning and load calculation", ["lifting plan", "load calculation"]],
  ["Tube and fitting scaffolding", ["tube and coupler scaffolding"]],
  ["System scaffolding", ["Cuplock", "Kwikstage", "Ringlock"]],
  ["Scaffold inspection"],
  // Electrical
  ["Electrical installation", ["electrical wiring", "wiring"]],
  ["Cable pulling and laying", ["cable laying"]],
  ["Cable termination and glanding", ["cable glanding", "termination"]],
  ["Panel wiring", ["control panel wiring"]],
  ["Motor control circuits", ["starter wiring", "DOL starter", "star-delta starter"]],
  ["Electrical testing and commissioning", ["testing and commissioning"]],
  ["Earthing and bonding", ["grounding"]],
  ["Insulation resistance testing", ["megger testing", "IR testing"]],
  ["High-voltage switching", ["HV switching", "HV operations"]],
  ["Electrical troubleshooting", ["electrical fault finding"]],
  ["Lighting installation"],
  ["Cable tray and conduit installation", ["cable tray", "conduit installation"]],
  // Instrumentation
  ["Instrument calibration", ["calibration"]],
  ["Loop checking", ["loop testing"]],
  ["Instrument tubing and fitting", ["instrument tubing", "compression fittings"]],
  ["Field instruments (pressure, flow, level, temperature)", ["field instruments", "transmitters"]],
  ["Control valve maintenance", ["valve maintenance"]],
  // HVAC & plumbing
  ["HVAC installation", ["air conditioning installation"]],
  ["Refrigeration systems", ["refrigeration"]],
  ["Chiller maintenance"],
  ["Duct fabrication and installation", ["ducting"]],
  ["Split and package AC servicing", ["AC servicing", "AC repair"]],
  ["Plumbing installation", ["plumbing"]],
  ["Pipe threading"],
  ["Sanitary fitting", ["sanitary installation"]],
  ["Drainage systems", ["drainage"]],
  ["Fire-fighting system installation", ["sprinkler installation", "fire-fighting piping"]],
  // Civil trades
  ["Blockwork", ["block masonry"]],
  ["Brickwork", ["bricklaying"]],
  ["Plastering"],
  ["Tiling", ["tile fixing"]],
  ["Concrete finishing", ["concreting"]],
  ["Formwork and shuttering", ["shuttering", "formwork"]],
  ["Steel fixing", ["rebar fixing", "bar bending"]],
  ["Carpentry", ["joinery"]],
  ["Waterproofing"],
  ["Gypsum and false ceiling", ["false ceiling", "drywall"]],
  // Painting & insulation
  ["Industrial painting", ["protective coating"]],
  ["Abrasive blasting", ["sandblasting", "grit blasting"]],
  ["Spray painting", ["airless spray painting"]],
  ["Thermal insulation", ["insulation"]],
  ["Metal cladding", ["cladding"]],
  // Heavy equipment & cranes
  ["Excavator operation", ["excavator operator"]],
  ["Wheel loader operation", ["shovel operator", "loader operator"]],
  ["Backhoe loader operation", ["JCB operator"]],
  ["Bulldozer operation", ["dozer"]],
  ["Motor grader operation", ["grader"]],
  ["Road roller operation", ["compactor"]],
  ["Mobile crane operation", ["hydraulic crane"]],
  ["Tower crane operation"],
  ["Overhead crane operation", ["EOT crane", "gantry crane"]],
  ["Forklift operation", ["forklift"]],
  ["Telehandler operation", ["telescopic handler"]],
  ["Aerial work platform operation", ["MEWP", "boom lift", "scissor lift"]],
  ["Dump truck operation", ["tipper"]],
  // Driving
  ["Light motor vehicle driving", ["LMV", "car driving"]],
  ["Heavy motor vehicle driving", ["HMV", "truck driving"]],
  ["Bus driving"],
  ["Trailer driving", ["articulated truck driving"]],
  ["Defensive driving"],
  ["Dangerous goods transport", ["hazardous goods driving", "ADR"]],
  // Mechanical
  ["Diesel engine repair", ["diesel mechanic"]],
  ["Automotive diagnostics", ["vehicle diagnostics", "OBD"]],
  ["Auto electrical repair", ["auto electrician"]],
  ["Hydraulic systems", ["hydraulics"]],
  ["Pneumatic systems", ["pneumatics"]],
  ["Pump maintenance"],
  ["Compressor maintenance"],
  ["Gearbox overhaul"],
  ["Shaft alignment", ["laser alignment"]],
  ["Bearing replacement"],
  ["Lathe operation", ["turning", "lathe machinist"]],
  ["Milling machine operation", ["milling"]],
  ["CNC machine operation", ["CNC operator"]],
  ["CNC programming (G-code)", ["G-code", "CNC programming"]],
  ["Precision measurement", ["vernier caliper", "micrometer", "metrology"]],
  ["Heavy equipment maintenance", ["plant mechanic"]],
  ["Marine engine maintenance"],
  // Hospitality & culinary
  ["Indian cuisine", ["Indian cooking"]],
  ["Continental cuisine", ["continental cooking"]],
  ["Arabic cuisine", ["Arabic cooking", "Middle Eastern cuisine"]],
  ["Chinese cuisine", ["Chinese cooking"]],
  ["Bakery and pastry", ["baking", "pastry"]],
  ["Tandoor cooking", ["tandoor"]],
  ["Bulk cooking", ["camp catering", "mass cooking"]],
  ["Food safety and hygiene (HACCP)", ["HACCP", "food hygiene"]],
  ["Housekeeping", ["room attendant"]],
  ["Laundry operations"],
  ["Food and beverage service", ["F&B service", "waiter"]],
  ["Barista", ["coffee making"]],
  ["Front office operations", ["reception", "front desk"]],
];

const INDUSTRIAL: readonly SkillTuple[] = [
  // Plant & sector operations
  ["Process plant operation", ["plant operator"]],
  ["Boiler operation", ["boiler attendant"]],
  ["Water treatment", ["water treatment plant", "WTP"]],
  ["Wastewater treatment", ["STP", "ETP"]],
  ["Oil and gas production operations", ["production operations"]],
  ["Refinery operations"],
  ["Pipeline construction", ["pipeline"]],
  ["Offshore operations", ["offshore"]],
  ["Drilling operations", ["drilling", "rig operations"]],
  ["Shipbuilding and hull fabrication", ["hull fabrication", "ship fitting"]],
  ["Ship repair"],
  ["Mining operations", ["mining"]],
  ["Power plant operation", ["power plant"]],
  ["Substation maintenance", ["substation"]],
  ["Transmission line work", ["overhead lines", "lineman"]],
  ["Solar PV installation", ["solar installation", "solar panels"]],
  ["Wind turbine maintenance", ["wind turbine technician"]],
  ["Telecom tower installation", ["tower climbing", "BTS installation"]],
  ["Fibre optic splicing", ["fiber splicing", "OFC"]],
  ["Turbine maintenance"],
  ["Preventive maintenance", ["planned maintenance"]],
  ["Shutdown and turnaround work", ["shutdown", "turnaround"]],
  // Manufacturing, logistics & facilities
  ["Lean manufacturing", ["lean"]],
  ["5S workplace organisation", ["5S"]],
  ["Production planning", ["PPC"]],
  ["Quality control", ["QC"]],
  ["Assembly line operation", ["assembly"]],
  ["Injection moulding", ["moulding"]],
  ["Packaging machine operation"],
  ["Inventory management", ["stock control"]],
  ["Warehouse operations", ["warehousing"]],
  ["Order picking and packing", ["picking", "packing"]],
  ["Logistics coordination", ["logistics"]],
  ["Procurement", ["purchasing", "buying"]],
  ["Supply chain management", ["SCM"]],
  ["Fleet management"],
  ["Facility management", ["FM"]],
  ["Building maintenance (MEP)", ["MEP maintenance"]],
  // Safety
  ["Permit to work", ["PTW"]],
  ["Confined space entry", ["confined space"]],
  ["Working at height", ["work at height", "fall protection"]],
  ["First aid"],
  ["H2S awareness", ["hydrogen sulphide awareness"]],
  ["Fire safety and firefighting", ["firefighting", "fire warden"]],
  ["Lockout/tagout (LOTO)", ["LOTO", "energy isolation"], "lockout-tagout-loto"],
  ["Risk assessment (HIRA / JSA)", ["JSA", "HIRA", "job safety analysis"]],
  ["Hot work safety", ["hot work"]],
  ["Gas testing", ["gas detection"]],
  ["Manual handling"],
  ["Emergency response"],
  ["Offshore safety and survival (BOSIET)", ["BOSIET", "offshore survival"]],
  ["Incident investigation"],
  ["HSE audits and inspections", ["safety audit", "HSE audit"]],
];

const TECHNICAL: readonly SkillTuple[] = [
  // NDT & quality
  ["Ultrasonic testing (UT)", ["UT", "ultrasonic testing"]],
  ["Radiographic testing (RT)", ["RT", "radiography"]],
  ["Magnetic particle testing (MT)", ["MT", "MPI"]],
  ["Liquid penetrant testing (PT)", ["PT", "dye penetrant", "DPT"]],
  ["Visual testing (VT)", ["VT", "visual inspection"]],
  ["Eddy current testing (ET)", ["ET", "eddy current"]],
  ["Phased array ultrasonic testing (PAUT)", ["PAUT"]],
  ["Radiographic film interpretation", ["RTFI", "film interpretation"]],
  ["Welding inspection", ["weld inspection"]],
  ["Coating inspection"],
  ["Dimensional inspection"],
  ["QA/QC documentation", ["quality documentation", "QC records"]],
  ["Inspection and test plans (ITP)", ["ITP"]],
  ["Material traceability"],
  ["ISO 9001 quality management", ["ISO 9001", "QMS"]],
  // Engineering & project
  ["Structural design"],
  ["Piping design", ["piping layout"]],
  ["Mechanical design"],
  ["Electrical design"],
  ["HVAC design"],
  ["Quantity surveying", ["QS", "BOQ preparation"]],
  ["Cost estimation", ["estimation"]],
  ["Project planning and scheduling", ["planning", "scheduling"]],
  ["Project management"],
  ["Construction management"],
  ["Site supervision"],
  ["Technical drawing", ["drafting"]],
  ["GD&T", ["geometric dimensioning and tolerancing"], "gd-and-t"],
  ["Welding metallurgy", ["metallurgy"]],
  ["Surveying and levelling", ["total station", "levelling"]],
  // Automation
  ["PLC basics", ["PLC", "programmable logic controller"]],
  ["PLC programming"],
  ["DCS operation", ["distributed control system"]],
  ["SCADA systems", ["SCADA"]],
  // IT
  ["Network administration", ["networking"]],
  ["Cybersecurity fundamentals", ["information security"]],
  ["Software testing", ["manual testing", "QA testing"]],
  ["Technical support", ["IT support", "helpdesk"]],
  ["Cloud computing"],
  ["Data analysis", ["data analytics"]],
  ["Web development"],
  ["Mobile app development"],
  // Healthcare
  ["Patient care"],
  ["General nursing", ["GNM", "nursing"]],
  ["ICU nursing", ["critical care nursing"]],
  ["Elderly care", ["geriatric care"]],
  ["Phlebotomy", ["blood collection"]],
  ["Medication administration"],
  ["Vital signs monitoring"],
  ["Infection control"],
  ["Basic life support (BLS)", ["BLS", "CPR"]],
  ["Laboratory testing", ["lab testing"]],
  ["Medical records management"],
  // Business & office
  ["Accounting", ["bookkeeping"]],
  ["GST compliance", ["GST"]],
  ["Payroll processing", ["payroll"]],
  ["Recruitment and talent acquisition", ["recruitment", "hiring"]],
  ["Sales and business development", ["sales", "business development"]],
  ["Customer relationship management", ["CRM"]],
  ["Teaching and training delivery", ["teaching", "training delivery"]],
  ["Curriculum development"],
];

const SOFTWARE: readonly SkillTuple[] = [
  ["AutoCAD"],
  ["SolidWorks"],
  ["Revit", ["Autodesk Revit"]],
  ["Tekla Structures", ["Tekla"]],
  ["Navisworks"],
  ["STAAD.Pro", ["STAAD"], "staad-pro"],
  ["ETABS"],
  ["CAESAR II", ["Caesar 2"]],
  ["AVEVA E3D", ["PDMS", "E3D"]],
  ["SmartPlant 3D", ["SP3D"]],
  ["Primavera P6", ["P6", "Primavera"]],
  ["Microsoft Project", ["MS Project"]],
  ["Microsoft Excel", ["MS Excel", "Excel"]],
  ["Microsoft Word", ["MS Word"]],
  ["Microsoft PowerPoint", ["MS PowerPoint"]],
  ["Google Workspace", ["Google Sheets", "Google Docs"]],
  ["Tally", ["Tally Prime", "Tally ERP"]],
  ["SAP", ["SAP ERP", "SAP S/4HANA"]],
  ["QuickBooks"],
  ["Zoho Books"],
  ["Python"],
  ["Java"],
  ["JavaScript"],
  ["TypeScript"],
  ["SQL"],
  ["C#", ["C sharp"], "csharp"],
  [".NET", ["dotnet", "ASP.NET"], "dotnet"],
  ["PHP"],
  ["React", ["React.js", "ReactJS"]],
  ["Node.js", ["NodeJS"], "nodejs"],
  ["HTML and CSS", ["HTML", "CSS"]],
  ["Power BI"],
  ["Tableau"],
  ["Git", ["GitHub", "version control"]],
  ["Linux administration", ["Linux"]],
  ["Windows Server"],
  ["Amazon Web Services (AWS)", ["AWS"]],
  ["Microsoft Azure", ["Azure"]],
  ["Docker"],
  ["Oracle Database", ["Oracle"]],
  ["MySQL"],
  ["PostgreSQL"],
  ["Salesforce"],
  ["MATLAB"],
];

const LANGUAGE: readonly SkillTuple[] = [
  ["English communication", ["spoken English"]],
  ["Business English"],
  ["Arabic conversation", ["spoken Arabic"]],
  ["Translation"],
  ["Interpretation", ["interpreting"]],
];

const SOFT: readonly SkillTuple[] = [
  ["Communication"],
  ["Teamwork"],
  ["Leadership"],
  ["Problem solving"],
  ["Time management"],
  ["Customer service"],
  ["Negotiation"],
  ["Adaptability"],
  ["Attention to detail"],
  ["Conflict resolution"],
  ["Presentation skills"],
  ["Decision making"],
  ["Critical thinking"],
  ["Mentoring and coaching", ["mentoring", "coaching"]],
  ["Multitasking"],
  ["Cross-cultural communication"],
  ["Planning and organising", ["organisation skills"]],
];

const BY_CATEGORY: Record<SkillCategory, readonly SkillTuple[]> = {
  trade: TRADE,
  industrial: INDUSTRIAL,
  technical: TECHNICAL,
  software: SOFTWARE,
  language: LANGUAGE,
  soft: SOFT,
};

export type SkillSeed = { slug: string; name: string; category: SkillCategory; synonyms: string[] };

export function skillSeedData(): SkillSeed[] {
  const data = (Object.entries(BY_CATEGORY) as [SkillCategory, readonly SkillTuple[]][]).flatMap(([category, list]) =>
    list.map(([name, synonyms, slug]) => ({ slug: slug ?? slugify(name), name, category, synonyms: [...(synonyms ?? [])] })),
  );
  for (const s of data) if (!s.slug) throw new Error(`Skill "${s.name}" needs an explicit slug`);
  assertUnique(data, (s) => s.slug, "skill slug");
  assertUnique(data, (s) => s.name.toLowerCase(), "skill name");
  return data;
}

export async function seedSkills(): Promise<SeedResult> {
  const data = skillSeedData();
  const results: { inserted: boolean }[] = [];
  for (const batch of chunk(data, 500)) {
    const rows = await db
      .insert(skills)
      .values(batch.map((s) => ({ ...s, status: "approved" as const, isActive: true })))
      .onConflictDoUpdate({
        target: skills.slug,
        // Add synonyms to curated skills that have none yet; never touch admin-edited ones.
        set: { synonyms: sql`excluded.synonyms` },
        setWhere: sql`cardinality(${skills.synonyms}) = 0 and cardinality(excluded.synonyms) > 0`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    results.push(...rows);
  }
  return { name: "skills", ...countInserted(results), total: data.length };
}
