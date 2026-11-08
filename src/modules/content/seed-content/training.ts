/**
 * Training course families shown on the Training service page (services tagged "training-course"; the hub is
 * the service tagged "training-hub"). Each family is an ordinary service entry, so the business can edit the
 * text, add photos and videos, reorder or unpublish it from the CMS, and it gets its own page with an enquiry
 * form. Scheduled courses with batches and fees live in the training module (/training).
 *
 * Copy rules: no promised jobs, no invented accreditation. Certificates are Venkat Sai certificates; the
 * 6G pipe test is a Venkat Sai assessment unless an external body is named on the certificate.
 */

type Pair = readonly [string, string];

export type TrainingFamilySeed = {
  slug: string;
  title: string;
  summary: string;
  iconName: string;
  intro: string;
  /** Sub-categories: processes, positions and topics (shown as the "What is included" cards). */
  topics: readonly Pair[];
  whoItHelps: readonly Pair[];
  requirements?: readonly string[];
  faqs?: readonly Pair[];
};

const COMMON_CLOSE =
  "Every course ends with a completion certificate from Venkat Sai, and includes trade test preparation for overseas interviews. Fees, duration and batch timings are confirmed when you enquire.";

export const TRAINING_BENEFITS = [
  "Hands-on practice in our Autonagar workshop",
  "Completion certificate from Venkat Sai",
  "Trade test preparation for overseas interviews",
  "Safety training from the first day",
] as const;

export const TRAINING_STEPS: readonly Pair[] = [
  ["Enquire", "Tell us your trade and experience on WhatsApp, by phone or with the form."],
  ["Level check", "We check your current skill level and suggest where to start."],
  ["Train", "Practise in the workshop under supervision."],
  ["Assessment", "Complete the practical assessment for the course."],
  ["Certificate", "Receive your Venkat Sai completion certificate."],
];

export const TRAINING_FAMILIES: readonly TrainingFamilySeed[] = [
  {
    slug: "welding-training",
    title: "Welding training",
    summary: "SMAW (arc), TIG, MIG/MAG and flux-cored welding on plate and pipe, from 1G to 6G, with 6G pipe test preparation.",
    iconName: "flame",
    intro:
      "Learn the welding processes employers test for, on plate and on pipe, in every position. Beginners start with arc welding on plate; experienced welders can train for new processes or for the 6G pipe test asked for in many overseas interviews.",
    topics: [
      ["SMAW (arc / stick) welding", "The most widely used process on sites and in fabrication shops."],
      ["GTAW (TIG) welding", "Clean, precise welds for pipe root runs, stainless steel and thin material."],
      ["GMAW (MIG / MAG) welding", "Fast, productive welding for fabrication and structural work."],
      ["FCAW (flux-cored) welding", "High deposition welding used in structural and heavy fabrication."],
      ["Plate positions 1G, 2G, 3G and 4G", "Flat, horizontal, vertical and overhead welding on plate."],
      ["Pipe positions 5G and 6G", "Fixed-pipe welding, including the all-position 6G pipe at 45 degrees."],
      ["6G pipe qualification", "Practice and a Venkat Sai 6G assessment, with a certificate stating the process, position and procedure used."],
      ["Weld quality and inspection", "Joint preparation, common defects and how welds are checked."],
    ],
    whoItHelps: [
      ["Beginners", "No welding experience needed for the basic arc welding course."],
      ["Welders", "Welders who want to add a process, a position or 6G pipe."],
    ],
    requirements: ["Advanced and 6G courses: a short practical test of your current level"],
    faqs: [
      ["Is the 6G certificate accepted abroad?", "Our certificate shows the process, position and procedure you were assessed on. Overseas employers usually run their own trade test as well; our training prepares you for it."],
    ],
  },
  {
    slug: "pipe-fitting-training",
    title: "Pipe fitting",
    summary: "Isometric drawings, measuring, cutting, fit-up and alignment of pipes, flanges, valves and supports.",
    iconName: "wrench",
    intro: "Pipe fitters prepare and assemble piping so it is ready to weld and test. Learn to read drawings, measure and cut accurately, and fit up spools to tolerance.",
    topics: [
      ["Reading isometric drawings", "Understand piping isometrics, symbols and bills of material."],
      ["Measuring, marking and cutting", "Take-offs, marking, gas and machine cutting, and bevelling."],
      ["Fit-up and alignment", "Elbows, tees, reducers and flanges fitted square and to tolerance."],
      ["Flanges, valves and supports", "Bolting, gaskets, valve installation and pipe supports."],
      ["Tack welding basics", "Tacking fit-ups ready for the welder."],
      ["Testing awareness", "Hydro testing and flushing basics."],
    ],
    whoItHelps: [
      ["Helpers", "Piping helpers who want to become fitters."],
      ["Fitters", "Fitters preparing for overseas trade tests."],
    ],
  },
  {
    slug: "structural-fitting-fabrication-training",
    title: "Structural fitting and fabrication",
    summary: "Fabrication drawings, layout, cutting and fit-up of beams, columns, plates and platforms.",
    iconName: "hammer",
    intro: "Structural fitters and fabricators turn drawings into steel structures. Learn layout, cutting and fit-up for beams, columns, bracing, platforms and plate work.",
    topics: [
      ["Reading fabrication drawings", "General arrangement and shop drawings, symbols and dimensions."],
      ["Marking and layout", "Templates, squaring and layout on plate and sections."],
      ["Cutting", "Gas cutting, plasma cutting and grinding."],
      ["Fit-up", "Beams, columns, bracing, stiffeners and base plates fitted to tolerance."],
      ["Bolting", "Bolted connections and tightening."],
      ["Checking", "Dimensional checks, level and plumb."],
    ],
    whoItHelps: [
      ["Helpers", "Fabrication helpers who want to become fitters."],
      ["Fitters", "Structural fitters preparing for overseas trade tests."],
    ],
  },
  {
    slug: "electrical-training",
    title: "Electrical",
    summary: "Industrial wiring, cable laying and termination, panel wiring, testing and electrical safety.",
    iconName: "zap",
    intro: "Industrial electricians install, connect and test power and control wiring on sites and in plants. Learn the practical skills, and the safety rules that come first.",
    topics: [
      ["Industrial wiring", "Conduit, cable tray, trunking and cable laying."],
      ["Cable termination and glanding", "Lugs, glands and terminations for power and control cables."],
      ["Panel wiring", "Distribution boards, starters and control panel wiring."],
      ["Motor connections", "Connecting and checking motors and starters."],
      ["Testing", "Continuity, insulation resistance and earthing checks."],
      ["Electrical safety", "Isolation, lockout and tagout, and safe working practices."],
    ],
    whoItHelps: [
      ["ITI and diploma holders", "Electrical trainees who want site and plant experience."],
      ["Electricians", "Electricians preparing for overseas trade tests."],
    ],
  },
  {
    slug: "piping-training",
    title: "Piping",
    summary: "Piping materials, components, drawings, supports and testing for piping technicians.",
    iconName: "route",
    intro: "Understand how piping systems are built, from materials and components to drawings and testing. Useful for fitters and helpers moving into piping technician roles.",
    topics: [
      ["Piping materials and components", "Pipe schedules, fittings, flanges, gaskets and valves."],
      ["P&ID and isometric reading", "Line numbers, symbols and how drawings relate to the site."],
      ["Supports and routing", "Pipe supports, slopes and clearances."],
      ["Testing and flushing", "Hydro and pneumatic test basics, flushing and reinstatement."],
      ["Quality records", "Test packs, inspection points and documentation basics."],
    ],
    whoItHelps: [["Fitters and helpers", "People moving into piping technician roles."]],
  },
  {
    slug: "rigging-training",
    title: "Rigging",
    summary: "Lifting gear, slings and shackles, load handling, crane signals and lifting safety.",
    iconName: "anchor",
    intro: "Riggers prepare and control lifts safely. Learn how to choose and inspect lifting gear, estimate loads, sling them correctly and signal the crane operator.",
    topics: [
      ["Lifting gear", "Slings, shackles, hooks, chain blocks and their safe working loads."],
      ["Inspection", "Checking lifting gear before use and recognising damage."],
      ["Load handling", "Load weight, centre of gravity and slinging methods."],
      ["Crane signals", "Standard hand signals and communication with the operator."],
      ["Lifting safety", "Lift plans, exclusion zones and tag lines."],
    ],
    whoItHelps: [["Helpers", "Site helpers who want to become riggers."]],
  },
  {
    slug: "scaffolding-training",
    title: "Scaffolding",
    summary: "Erecting, inspecting and dismantling scaffolds safely, with working-at-height training.",
    iconName: "hard-hat",
    intro: "Scaffolders build the access everyone else works from. Learn scaffold types, safe erection and dismantling, inspection and tagging, and working at height.",
    topics: [
      ["Scaffold types", "Tube and clamp, and system scaffolds such as cup-lock."],
      ["Erection and dismantling", "Base plates, standards, ledgers, transoms, bracing and boards in the right order."],
      ["Inspection and tagging", "Checking scaffolds and using scaffold tags."],
      ["Working at height", "Harnesses, anchor points and fall protection."],
    ],
    whoItHelps: [["Helpers", "Site helpers who want to become scaffolders."]],
  },
  {
    slug: "mechanical-fitter-training",
    title: "Mechanical helper and fitter basics",
    summary: "Hand and power tools, measuring, bolting, pumps and valves, and basic maintenance.",
    iconName: "cog",
    intro: "A practical start for mechanical helpers and fitters: the tools, measurements and basic maintenance tasks used in plants, workshops and on sites.",
    topics: [
      ["Hand and power tools", "Choosing and using tools safely."],
      ["Measuring", "Vernier calipers, micrometers, tapes and levels."],
      ["Bolting and torque", "Bolt tightening sequences and torque tools."],
      ["Pumps and valves", "How common pumps and valves work, and basic servicing."],
      ["Maintenance basics", "Alignment, lubrication and simple fault finding."],
    ],
    whoItHelps: [["Beginners and helpers", "People starting in mechanical maintenance or fitting."]],
  },
  {
    slug: "ndt-awareness-training",
    title: "NDT testing awareness",
    summary: "What radiography (RT), ultrasonic (UT), magnetic particle (MPT) and dye penetrant (DPT) tests find, and how to prepare for them.",
    iconName: "search",
    intro:
      "Welders and fitters work better when they understand how their work is tested. This awareness course explains the common non-destructive tests and how to prepare joints for them. It is an awareness course, not an NDT technician qualification.",
    topics: [
      ["Radiographic testing (RT)", "How weld radiography works and the defects it shows."],
      ["Ultrasonic testing (UT)", "What ultrasonic testing finds and how joints are prepared."],
      ["Magnetic particle testing (MPT)", "Surface and near-surface cracks in magnetic materials."],
      ["Dye penetrant testing (DPT)", "Surface defects on any non-porous material."],
      ["Visual inspection", "Checking welds before they go for testing."],
    ],
    whoItHelps: [["Welders and fitters", "Tradespeople who want to reduce repairs and understand test reports."]],
  },
  {
    slug: "hse-safety-training",
    title: "HSE and safety",
    summary: "PPE, permits to work, hot work, working at height, confined space and fire safety awareness.",
    iconName: "shield-check",
    intro: "Safety is part of every trade we teach, and employers abroad check it in interviews. This course covers the safety knowledge every site worker needs.",
    topics: [
      ["PPE", "Choosing, wearing and caring for personal protective equipment."],
      ["Permit to work", "How permits control hazardous work."],
      ["Hot work safety", "Fire watch, gas testing and safe welding and cutting."],
      ["Working at height", "Ladders, scaffolds, harnesses and fall protection."],
      ["Confined space awareness", "Hazards, gas testing and rescue arrangements."],
      ["Fire safety and first aid awareness", "Extinguishers, emergency response and basic first aid."],
    ],
    whoItHelps: [["Every trade", "Welders, fitters, electricians, riggers, scaffolders and helpers."]],
  },
];

export const TRAINING_COMMON_CLOSE = COMMON_CLOSE;
