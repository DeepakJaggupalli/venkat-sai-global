/**
 * Venkat Sai's own training programmes as published courses in the training module (shown on /training and the
 * homepage training teaser).
 *
 *   npm run db:seed:training            (same environment as `npm run db:seed`: DATABASE_URL, SEED_ADMIN_EMAIL)
 *
 * Every course is created through the module's own services (createCourse → addCourseModule →
 * submitCourseForPublication), so validation, sanitising, human codes and the audit trail apply unchanged.
 * Venkat Sai courses (organisation null) publish directly; no approval request is filed.
 *
 * Idempotent and insert-only: a course whose slug already exists (any status, including archived or binned) is
 * skipped and never touched, so staff edits always win. A second run creates nothing.
 *
 * Facts kept honest: in person at the Autonagar, Gajuwaka workshop, certificate of completion (a Venkat Sai
 * trade assessment, never an accredited or third-party certification), fee on request (no prices), and no
 * batches or dates (staff add schedules later; the course page points people to WhatsApp for the next batch).
 * Matching taxonomy skills are linked by name when they exist.
 *
 * Actions are recorded in the audit log as the Super Admin named by SEED_ADMIN_EMAIL (or TRAINING_SEED_EMAIL),
 * falling back to the first Super Admin.
 */
import Module from "node:module";
import path from "node:path";

const root = path.resolve(__dirname, "..");

/** Same alias as scripts/seed.ts: the react-server build of next/navigation for server-only modules. */
function aliasReactServerNavigation(): void {
  const target = require.resolve("next/dist/client/components/navigation.react-server.js");
  const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const original = loader._resolveFilename;
  loader._resolveFilename = function resolve(this: unknown, request: string, ...rest: unknown[]): string {
    if (request === "next/navigation" || request === "next/navigation.js") return target;
    return original.call(this, request, ...rest);
  };
}
aliasReactServerNavigation();

type ProgramSpec = {
  title: string;
  summary: string;
  category: "welding" | "industrial";
  durationHours: number;
  /** Overview paragraphs (the shared "where / certificate / batches" paragraphs are appended). */
  overview: string[];
  eligibility: string;
  prerequisites: string;
  modules: { title: string; description: string }[];
  outcomes: string[];
  /** Taxonomy skill names (src/server/seed/skills.ts); missing ones are reported and left out. */
  skills: string[];
};

const WHERE = "Autonagar, Gajuwaka, Visakhapatnam";

const SHARED_OVERVIEW = [
  `<p><strong>Where:</strong> in person at the Venkat Sai Welding Works and Testing Center workshop, ${WHERE}, in small groups with an instructor beside you.</p>`,
  "<p><strong>Certificate:</strong> learners who complete the course receive a Venkat Sai certificate of completion. The final practical is a Venkat Sai trade assessment; it is not an accredited or third-party certification.</p>",
  "<p><strong>Batches:</strong> new batches start through the year. Message us on WhatsApp or call to hear the next start date, timings and fee.</p>",
];

const FEE_NOTES = "Ask us on WhatsApp or call for the current fee. A course fee is never a condition of a job application or placement.";

const PROGRAMS: ProgramSpec[] = [
  {
    title: "Arc Welding (SMAW) 3G/4G Plate",
    summary: `Hands-on stick welding on carbon steel plate in the vertical (3G) and overhead (4G) positions, the plate tests employers in India and abroad ask for. About 120 hours at our workshop in ${WHERE}.`,
    category: "welding",
    durationHours: 120,
    overview: [
      "A practical, booth-based course in shielded metal arc welding (SMAW, also called stick or arc welding). Most of the time is spent welding: you start with safe set-up and straight beads, move on to groove joints on carbon steel plate, and finish with full 3G (vertical up) and 4G (overhead) test plates.",
    ],
    eligibility: "Beginners and helpers who want to become plate welders, and welders who want to pass 3G and 4G plate tests for jobs in India or abroad.",
    prerequisites: "No welding experience needed. You should be fit for workshop work and comfortable with basic measurements.",
    modules: [
      { title: "Welding safety and machine set-up", description: "Protective equipment, fume and fire safety, the SMAW machine, polarity, electrode types and choosing the current." },
      { title: "Striking the arc and bead control", description: "Arc length, electrode angle and travel speed; stringer and weave beads on flat plate; restarts and tie-ins." },
      { title: "Joint preparation, fit-up and tacking", description: "Bevelling and grinding, root gap and root face, tack welds and controlling distortion." },
      { title: "Groove welds in the flat and horizontal positions", description: "Root, hot pass, fill and cap on 1G and 2G plate joints, with cleaning between passes." },
      { title: "3G vertical-up plate", description: "Vertical-up technique for root, fill and cap on groove joints, and keeping the weld profile even." },
      { title: "4G overhead plate and final test", description: "Overhead technique, recognising and avoiding defects (porosity, undercut, slag), and the final 3G/4G test plate." },
    ],
    outcomes: [
      "Set up an arc welding machine safely and choose the electrode and current for the job",
      "Prepare, fit up and tack carbon steel plate joints",
      "Weld root, fill and cap passes in the 3G and 4G positions",
      "Recognise common weld defects and know how to prevent them",
      "Complete 3G and 4G test plates assessed by Venkat Sai",
    ],
    skills: [
      "Shielded metal arc welding (SMAW)",
      "3G welding (vertical groove)",
      "4G welding (overhead groove)",
      "Carbon steel welding",
      "Weld joint preparation",
      "Fit-up and tack welding",
    ],
  },
  {
    title: "TIG Welding (GTAW) 6G Pipe - Carbon & Stainless Steel",
    summary: `Argon (TIG) welding of carbon steel and stainless steel pipe up to the 6G position, for welders aiming at pipe work in oil and gas, power and process plants. About 180 hours, in person in ${WHERE}.`,
    category: "welding",
    durationHours: 180,
    overview: [
      "A pipe-focused course in gas tungsten arc welding (GTAW, also called TIG or argon welding). You build clean filler and puddle control on plate, then weld carbon steel and stainless steel pipe in fixed positions, working up to the 6G inclined position used in most pipe welder tests.",
    ],
    eligibility: "Welders with some arc or TIG experience who want to move into pipe welding. Complete beginners should start with the arc welding course.",
    prerequisites: "Basic welding experience (arc or TIG on plate) is strongly recommended.",
    modules: [
      { title: "TIG safety, equipment and set-up", description: "Power source, torch and gas lens, tungsten selection and grinding, argon flow and machine settings." },
      { title: "Filler and puddle control on plate", description: "Two-hand coordination, feeding filler wire, puddle control and consistent bead width." },
      { title: "Pipe preparation, fit-up and purging", description: "Bevelling, root gap and alignment, tacking, and back purging for stainless steel." },
      { title: "Carbon steel pipe in the 2G and 5G positions", description: "Root and hot pass on fixed pipe, controlling penetration and keeping the root even all round." },
      { title: "Stainless steel pipe", description: "Heat control, cleanliness, purge quality and avoiding oxidation on stainless steel joints." },
      { title: "6G pipe and final test", description: "Full joints in the 6G inclined position in carbon and stainless steel, visual checks of the weld, and the final 6G test piece." },
    ],
    outcomes: [
      "Set up a TIG machine, tungsten and gas correctly for carbon and stainless steel",
      "Prepare, fit up and purge pipe joints",
      "Weld root, hot pass and cap on pipe in the 2G, 5G and 6G positions",
      "Control heat and cleanliness on stainless steel",
      "Complete a 6G pipe test piece assessed by Venkat Sai",
    ],
    skills: [
      "Gas tungsten arc welding (GTAW)",
      "6G pipe welding",
      "Carbon steel welding",
      "Stainless steel welding",
      "Weld joint preparation",
      "Fit-up and tack welding",
    ],
  },
  {
    title: "MIG/MAG (GMAW) and FCAW Welding",
    summary: `Semi-automatic wire welding, MIG/MAG and flux-cored, on carbon steel for fabrication shops, structural work and shipyards. About 120 hours at our workshop in ${WHERE}.`,
    category: "welding",
    durationHours: 120,
    overview: [
      "A practical course in gas metal arc welding (GMAW, also called MIG/MAG or CO2 welding) and flux-cored arc welding (FCAW). You learn to set up the wire feeder and gas, control the arc, and weld fillet and groove joints on carbon steel plate in different positions.",
    ],
    eligibility: "Beginners, helpers and arc welders who want to work as MIG/MAG or flux-cored welders in fabrication, structural steel or shipbuilding.",
    prerequisites: "No welding experience needed, though any workshop experience helps.",
    modules: [
      { title: "Safety and wire-feed set-up", description: "Machine, wire feeder, liners and tips, shielding gas, polarity, and setting voltage and wire speed." },
      { title: "Arc control and bead technique", description: "Gun angle, stick-out and travel speed, metal transfer modes and spatter control." },
      { title: "Fillet welds in all positions", description: "Fillet welds from flat to overhead (1F to 4F), leg length and profile." },
      { title: "Groove welds on plate", description: "Root, fill and cap on groove joints in the flat, horizontal and vertical positions." },
      { title: "Flux-cored arc welding (FCAW)", description: "Gas-shielded and self-shielded wires, slag handling and out-of-position welding." },
      { title: "Defects, distortion and final test", description: "Porosity, lack of fusion and undercut, distortion control, and the final test plate." },
    ],
    outcomes: [
      "Set up MIG/MAG and flux-cored equipment for carbon steel",
      "Weld fillet joints from flat to overhead",
      "Weld groove joints on plate in the flat, horizontal and vertical positions",
      "Recognise and prevent common wire-welding defects",
      "Complete a test plate assessed by Venkat Sai",
    ],
    skills: [
      "Gas metal arc welding (GMAW)",
      "Flux-cored arc welding (FCAW)",
      "Carbon steel welding",
      "2F fillet welding (horizontal)",
      "3F fillet welding (vertical)",
      "3G welding (vertical groove)",
    ],
  },
  {
    title: "Pipe Welding 6G Combination (TIG root, Arc fill and cap)",
    summary: `The combination pipe test many overseas employers use: a TIG root and hot pass, then arc (SMAW) fill and cap, on carbon steel pipe in the 6G position. About 180 hours, in person in ${WHERE}.`,
    category: "welding",
    durationHours: 180,
    overview: [
      "A course for welders preparing for 6G combination pipe tests. You put in the root and hot pass with TIG (GTAW), change to arc welding (SMAW) with low-hydrogen electrodes for the fill and cap, and practise the whole joint until it is consistent in the 6G inclined position.",
    ],
    eligibility: "Welders who already weld with TIG and arc and want to pass a 6G combination pipe test for jobs in India or abroad.",
    prerequisites: "TIG and arc welding experience on plate or pipe. Our arc and TIG courses are a good starting point.",
    modules: [
      { title: "Pipe preparation, fit-up and tacking", description: "Bevel angle, root face and gap, alignment and tack welds that hold through the root." },
      { title: "TIG root and hot pass", description: "Keyhole root, even penetration all round, and a hot pass that sets up the fill." },
      { title: "Arc fill passes", description: "Low-hydrogen electrodes, interpass cleaning, heat input and building the joint evenly." },
      { title: "Arc capping", description: "Cap profile and width, tie-ins and avoiding undercut." },
      { title: "Working up to 6G", description: "Full combination joints in the 2G and 5G positions, then the 6G inclined position." },
      { title: "Reading a WPS and final test", description: "What a welding procedure specification asks for, preheat and interpass temperature, and the final 6G combination test piece." },
    ],
    outcomes: [
      "Fit up and tack carbon steel pipe ready for a combination joint",
      "Run a TIG root and hot pass with even penetration",
      "Fill and cap with arc welding to a good profile",
      "Follow the main requirements of a welding procedure specification",
      "Complete a 6G combination test piece assessed by Venkat Sai",
    ],
    skills: [
      "Gas tungsten arc welding (GTAW)",
      "Shielded metal arc welding (SMAW)",
      "6G pipe welding",
      "Carbon steel welding",
      "WPS and PQR familiarity",
      "Fit-up and tack welding",
    ],
  },
  {
    title: "Industrial Electrician - wiring, panels and motor control",
    summary: `Practical industrial electrical work: cable laying and termination, distribution boards and control panels, motor starters and safe testing, for electrician jobs in plants and on construction sites. About 240 hours, in person in ${WHERE}.`,
    category: "industrial",
    durationHours: 240,
    overview: [
      "A hands-on course for industrial electricians. You work on real cables, boards and starters: safe isolation, cabling and termination, panel wiring, motor control circuits, earthing, testing and fault finding, with plenty of practice on training panels.",
    ],
    eligibility: "ITI or diploma electricians, wiremen, and electrical helpers with site experience who want industrial electrician work in India or abroad.",
    prerequisites: "Basic electrical knowledge (ITI electrician or wireman, or site experience) is recommended.",
    modules: [
      { title: "Electrical safety and safe isolation", description: "Shock and arc hazards, protective equipment, lockout/tagout and permit-to-work basics." },
      { title: "Tools, meters and drawings", description: "Multimeter, clamp meter and insulation tester; reading single-line and wiring diagrams." },
      { title: "Cabling, glanding and termination", description: "Cable trays and conduit, armoured cable, glands, lugs and neat terminations." },
      { title: "Distribution boards and control panels", description: "MCBs, RCCBs and MCCBs, busbars, panel wiring and ferruling." },
      { title: "Motor control circuits", description: "Contactors and overloads, DOL and star-delta starters, interlocks and forward/reverse control." },
      { title: "Earthing, testing and fault finding", description: "Earthing and bonding, insulation resistance, continuity and polarity tests, and systematic troubleshooting." },
    ],
    outcomes: [
      "Isolate and lock out equipment safely before work",
      "Lay, gland and terminate industrial cables neatly",
      "Wire distribution boards and control panels from a diagram",
      "Wire and test DOL and star-delta motor starters",
      "Test insulation, continuity and earthing, and find common faults",
      "Complete a practical assessed by Venkat Sai",
    ],
    skills: [
      "Electrical installation",
      "Cable termination and glanding",
      "Panel wiring",
      "Motor control circuits",
      "Earthing and bonding",
      "Insulation resistance testing",
      "Electrical troubleshooting",
      "Cable tray and conduit installation",
      "Lockout/tagout (LOTO)",
    ],
  },
  {
    title: "Pipe Fitter - isometric drawings, fit-up and alignment",
    summary: `Read piping isometrics, measure, cut and bevel, and fit up pipe, fittings, flanges and supports ready for welding. About 120 hours at our workshop in ${WHERE}.`,
    category: "industrial",
    durationHours: 120,
    overview: [
      "A practical pipe fitting course built around isometric drawings. You learn the materials and fittings, work out cut lengths from an isometric, cut and bevel pipe, and fit up and align spools, flanges and supports the way welders and inspectors expect.",
    ],
    eligibility: "Helpers, fitters and ITI fitters who want to work as pipe fitters on plant, refinery and construction projects.",
    prerequisites: "Basic arithmetic and measuring in millimetres and inches. Helper experience is useful but not required.",
    modules: [
      { title: "Piping basics and safety", description: "Pipe sizes and schedules, materials, fittings, flanges and valves; hot work and lifting safety." },
      { title: "Reading isometric drawings", description: "Symbols, dimensions, elevations, bill of materials and working out cut lengths." },
      { title: "Measuring, cutting and bevelling", description: "Marking, take-offs, gas and grinder cutting, and bevel preparation." },
      { title: "Fit-up and alignment", description: "Root gap, pipe-to-pipe and pipe-to-fitting alignment, flange orientation and level." },
      { title: "Spools, supports and flange joints", description: "Spool assembly, pipe supports, gaskets and bolt tightening sequence." },
      { title: "Hydrotest basics and practical project", description: "How lines are pressure tested, and fitting up a spool from an isometric drawing." },
    ],
    outcomes: [
      "Read a piping isometric and prepare a cutting list",
      "Measure, cut and bevel pipe accurately",
      "Fit up and align pipe, fittings and flanges within tolerance",
      "Assemble spools and pipe supports and make up flange joints",
      "Complete a fit-up project assessed by Venkat Sai",
    ],
    skills: [
      "Isometric drawing reading",
      "Pipe fitting",
      "Fit-up and tack welding",
      "Pipe spool fabrication",
      "Flange management and bolt torquing",
      "Pipe support installation",
      "Hydrostatic testing",
    ],
  },
  {
    title: "Structural Fitter and Fabricator",
    summary: `Mark, cut, fit and tack structural steel from fabrication drawings, from beams and columns to plates, brackets and frames. About 120 hours at our workshop in ${WHERE}.`,
    category: "industrial",
    durationHours: 120,
    overview: [
      "A practical course for structural steel fitters and fabricators. You read fabrication drawings, mark out and cut steel sections and plate, and fit up and tack assemblies square and to size, ready for welding and erection.",
    ],
    eligibility: "Helpers, ITI fitters and welders who want to work as structural fitters or fabricators in workshops and on steel structure projects.",
    prerequisites: "Basic arithmetic and measuring. Workshop experience is useful but not required.",
    modules: [
      { title: "Safety, tools and steel sections", description: "Beams, channels, angles and plate; hand and power tools; hot work and lifting safety." },
      { title: "Reading fabrication drawings", description: "Views, dimensions, welding symbols and cutting lists." },
      { title: "Marking out and layout", description: "Templates, squaring, levelling and accurate measurement." },
      { title: "Cutting, drilling and edge preparation", description: "Gas cutting, grinding, drilling and preparing edges for welding." },
      { title: "Fit-up, tacking and distortion control", description: "Beam-to-column joints, base plates and brackets, tolerances and keeping work square." },
      { title: "Assembly and erection basics", description: "Bolted connections, alignment and a final fabrication project." },
    ],
    outcomes: [
      "Read fabrication drawings and welding symbols",
      "Mark out, cut and drill steel sections and plate",
      "Fit up and tack structural assemblies square and to size",
      "Control distortion and check work against tolerances",
      "Complete a fabrication project assessed by Venkat Sai",
    ],
    skills: [
      "Blueprint reading",
      "Structural steel fabrication",
      "Structural steel erection",
      "Fit-up and tack welding",
      "Oxy-fuel welding and cutting",
      "Grinding and finishing",
    ],
  },
  {
    title: "Rigging and Scaffolding basics",
    summary: `Safe lifting and access work: slings, shackles and hand signals, and putting up and taking down basic scaffolds. About 60 hours, in person in ${WHERE}.`,
    category: "industrial",
    durationHours: 60,
    overview: [
      "An introductory course for rigging and scaffolding work. You learn to work safely at height, choose and inspect lifting gear, sling loads and signal to a crane operator, and erect, inspect and dismantle basic scaffolds as part of a team.",
      "This is a basics course. Where an employer asks for a third-party rigger or scaffolder card, that is a separate certification.",
    ],
    eligibility: "Helpers and new workers who want rigger or scaffolder jobs, and anyone who works around lifting and scaffolds on site.",
    prerequisites: "Fit for physical work and working at height.",
    modules: [
      { title: "Working at height and site safety", description: "Fall protection, harness use, permit to work and preventing dropped objects." },
      { title: "Lifting gear and inspection", description: "Wire rope and webbing slings, shackles, hooks and chain blocks; safe working load and pre-use checks." },
      { title: "Slinging, signalling and tag lines", description: "Sling angles, centre of gravity, standard hand signals and controlling the load." },
      { title: "Scaffold components and types", description: "Tube and fitting and system scaffolds; base plates, standards, ledgers, transoms, bracing and boards." },
      { title: "Erecting, inspecting and dismantling", description: "Putting up a basic scaffold as a team, checking it before use and taking it down safely." },
    ],
    outcomes: [
      "Work safely at height with the right fall protection",
      "Inspect slings, shackles and other lifting gear before use",
      "Sling simple loads and give standard crane hand signals",
      "Erect, check and dismantle a basic scaffold as part of a team",
      "Complete a practical assessed by Venkat Sai",
    ],
    skills: ["Rigging", "Slinging and signalling", "Tube and fitting scaffolding", "System scaffolding", "Working at height"],
  },
  {
    title: "Mechanical Helper / Fitter basics",
    summary: `A practical start for new workers: hand and power tools, measuring, bolting, basic maintenance and site safety, for helper jobs in plants, workshops and shutdowns. About 60 hours at our workshop in ${WHERE}.`,
    category: "industrial",
    durationHours: 60,
    overview: [
      "A short, practical course for people starting out in mechanical work. You learn to use hand and power tools and measuring instruments correctly, make up bolted joints, help with basic maintenance, and work safely alongside welders, fitters and riggers.",
    ],
    eligibility: "Freshers and unskilled workers who want a first job as a mechanical helper, and helpers who want to move up to fitter work.",
    prerequisites: "None.",
    modules: [
      { title: "Workshop and site safety", description: "Protective equipment, lockout/tagout basics, permit to work and safe manual handling." },
      { title: "Hand tools, power tools and measuring", description: "Spanners, torque wrench, grinder and drill; measuring tape, vernier caliper and try square." },
      { title: "Bolting and flange joints", description: "Gaskets, bolt tightening sequence and torque." },
      { title: "Basic mechanical maintenance", description: "Bearings, couplings and pumps; dismantling and reassembling with care." },
      { title: "Working with the trades", description: "Supporting welders, fitters and riggers, housekeeping and following a simple job card." },
    ],
    outcomes: [
      "Use common hand tools, power tools and measuring instruments correctly",
      "Make up bolted and flanged joints in the right sequence",
      "Help with basic maintenance on bearings, couplings and pumps",
      "Work safely on site and support the trades",
      "Complete a practical assessed by Venkat Sai",
    ],
    skills: ["Grinding and finishing", "Flange management and bolt torquing", "Bearing replacement", "Pump maintenance", "Permit to work", "Lockout/tagout (LOTO)"],
  },
];

function redactUrl(url: string): string {
  return url.replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(root, process.env.NODE_ENV !== "production", { info: () => undefined, error: console.error });
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local (or set it in the environment).");
    return 1;
  }
  console.log(`Training programmes on ${redactUrl(process.env.DATABASE_URL)}`);

  const { and, asc, eq, inArray } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { courses, roles, skills, userRoles, users } = await import("@/db/schema");
  const { slugify } = await import("@/lib/http");
  const { addCourseModule, createCourse, submitCourseForPublication } = await import("@/modules/training/courses");
  const { courseModuleSchema, courseSchema } = await import("@/modules/training/schemas");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const counts = { created: 0, skipped: 0, failed: 0 };

  try {
    // ---- Actor (audit trail) -------------------------------------------------------------------------------
    const email = (process.env.TRAINING_SEED_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
    const admins = await db
      .select({ user: users })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(roles.key, "super_admin"), eq(users.isStaff, true), eq(users.status, "active")))
      .orderBy(asc(users.createdAt));
    const actor = admins.find((a) => email && a.user.email?.toLowerCase() === email)?.user ?? admins[0]?.user;
    if (!actor) {
      console.error("No Super Admin found. Run `npm run db:seed` with SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD first.");
      return 1;
    }
    const ctx: StaffContext = {
      user: {
        id: actor.id,
        email: actor.email,
        phone: actor.phone,
        emailVerifiedAt: actor.emailVerifiedAt,
        phoneVerifiedAt: actor.phoneVerifiedAt,
        displayName: actor.displayName,
        avatarFileId: null,
        status: "active",
        isStaff: true,
        locale: "en",
        timezone: null,
        hasPassword: true,
        twoFactorEnabled: true,
      },
      roleKeys: ["super_admin"],
      permissions: new Set(["training.manage", "training.view"]),
      isSuperAdmin: true,
    };
    console.log(`Acting as ${actor.displayName} (Super Admin)`);

    // ---- Taxonomy skills (linked by exact name when present) ----------------------------------------------
    const wanted = [...new Set(PROGRAMS.flatMap((p) => p.skills))];
    const skillRows = await db
      .select({ id: skills.id, name: skills.name })
      .from(skills)
      .where(and(inArray(skills.name, wanted), eq(skills.isActive, true), eq(skills.status, "approved")));
    const skillIds = new Map(skillRows.map((s) => [s.name, s.id]));
    const missingSkills = wanted.filter((n) => !skillIds.has(n));
    if (missingSkills.length) console.log(`  (skills not in the taxonomy, left out: ${missingSkills.join("; ")})`);

    // ---- Courses -------------------------------------------------------------------------------------------
    // Publication times step back one second per course, so the catalogue (newest first) lists them in this order.
    const runStart = Date.now();
    for (const [index, spec] of PROGRAMS.entries()) {
      const slug = slugify(spec.title);
      const label = `${spec.title} (/training/${slug})`;
      const [existing] = await db.select({ code: courses.code, status: courses.status, deletedAt: courses.deletedAt }).from(courses).where(eq(courses.slug, slug)).limit(1);
      if (existing) {
        counts.skipped += 1;
        console.log(`  [skipped] ${label} - already exists (${existing.code}, ${existing.deletedAt ? "in the bin" : existing.status})`);
        continue;
      }

      let createdCode: string | null = null;
      try {
        const input = courseSchema.parse({
          title: spec.title,
          summary: spec.summary,
          descriptionHtml: [...spec.overview.map((p) => (p.startsWith("<") ? p : `<p>${p}</p>`)), ...SHARED_OVERVIEW].join("\n"),
          category: spec.category,
          skillIds: spec.skills.map((n) => skillIds.get(n)).filter((id): id is string => Boolean(id)),
          mode: "in_person",
          durationHours: spec.durationHours,
          eligibility: spec.eligibility,
          prerequisites: spec.prerequisites,
          outcomes: spec.outcomes,
          feeType: "on_request",
          feeNotes: FEE_NOTES,
          languageCodes: [],
          certificationType: "completion_only",
        });
        const course = await createCourse(ctx, input);
        createdCode = course.code;
        if (course.slug !== slug) console.warn(`  [warning] ${spec.title} got the slug ${course.slug} instead of ${slug}`);
        for (const mod of spec.modules) {
          await addCourseModule(ctx, course.id, courseModuleSchema.parse({ title: mod.title, description: mod.description, materialFileIds: [] }));
        }
        const published = await submitCourseForPublication(ctx, course.id, new Date(runStart - index * 1000));
        counts.created += 1;
        console.log(`  [created] ${label} - ${course.code}, ${spec.modules.length} modules, ${input.skillIds.length} skills, ${published.status}`);
      } catch (error) {
        counts.failed += 1;
        const hint = createdCode ? ` (course ${createdCode} was created as a draft: finish it in the Command Centre under Training)` : "";
        console.error(`  [failed] ${label} - ${message(error)}${hint}`);
      }
    }
  } catch (error) {
    console.error("Training programmes failed:", error instanceof Error ? (error.stack ?? error.message) : error);
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }

  console.log(`Training programmes finished: ${counts.created} created, ${counts.skipped} skipped (already exist), ${counts.failed} failed.`);
  return counts.failed ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
