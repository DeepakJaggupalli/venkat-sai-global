import { TRAINING_BENEFITS, TRAINING_COMMON_CLOSE, TRAINING_FAMILIES, TRAINING_STEPS, type TrainingFamilySeed } from "./training";
import type { SeedEntrySpec } from "./types";

/**
 * The 18 services of the product specification (§7.5) plus the training course families (training.ts). Copy is
 * deliberately plain and claim-free: it says what the service is and how it works, never how many people were
 * placed or which clients were served, and never promises a job or a visa.
 *
 * Main services (featured, shown first on /services): overseas employment, training (technical-training) and
 * manpower supply (bulk-manpower-supply). Everything else is listed under "All services".
 *
 * Published: services that reflect existing business activities (overseas recruitment, manpower supply, trade
 * training, internships and testing) or platform functionality available at launch (job board, applications,
 * apprenticeships, courses, assessments, career tools), and the ten training course families. The other seven
 * stay drafts until the business confirms it offers them.
 */

type Pair = readonly [string, string];

type ServiceSeed = {
  slug: string;
  title: string;
  summary: string;
  publish: boolean;
  iconName: string;
  enquiryType: "general" | "employer" | "partner" | "institution" | "candidate_support";
  overview: readonly string[];
  whoItHelps: readonly Pair[];
  whatWeProvide: readonly Pair[];
  processSteps: readonly Pair[];
  benefits?: readonly string[];
  requirements?: readonly string[];
  faqs?: readonly Pair[];
  cta: { label: string; href: string };
  /** Main service: shown first, as a large card, on /services. */
  featured?: boolean;
  /** Entry tags that drive page behaviour: "training-hub", "training-course", "course-fee". */
  tags?: readonly string[];
};

const NO_FEES =
  "Candidates are never charged to discover, apply for, be submitted for, be interviewed for or be tested for a job through Venkat Sai Global.";

const SERVICES: readonly ServiceSeed[] = [
  {
    slug: "recruitment-and-placements",
    title: "Recruitment and placements",
    summary: "Help for employers to find suitable candidates, and for candidates to find suitable jobs.",
    publish: true,
    iconName: "briefcase",
    enquiryType: "employer",
    overview: [
      "Venkat Sai helps employers fill permanent, contract and project roles, and helps candidates find jobs that match their skills and goals.",
      "Employers share their requirements; the Venkat Sai team reviews them, identifies suitable candidates, arranges interviews and, where the role needs it, practical trade tests. Selected candidates are supported through the offer and joining.",
      NO_FEES,
    ],
    whoItHelps: [
      ["Employers", "Companies hiring for one role or many, in India or abroad."],
      ["Candidates", "People looking for their next job, from freshers to experienced professionals."],
    ],
    whatWeProvide: [
      ["Requirement review", "We confirm the role, skills, experience, location and terms with the employer before searching."],
      ["Candidate screening", "Profiles are checked against the requirement before they are shared with the employer."],
      ["Interviews and trade tests", "We arrange interviews and, where needed, practical tests."],
      ["Offer and joining support", "We keep both sides informed until the candidate joins."],
    ],
    processSteps: [
      ["Share the requirement", "Post a job or submit a workforce requirement."],
      ["Shortlist", "Venkat Sai screens candidates and shares a shortlist."],
      ["Interview and select", "The employer interviews and selects candidates."],
      ["Offer and join", "The selected candidate accepts the offer and joins."],
    ],
    benefits: ["One point of contact for the whole hiring process", "Candidates screened against your requirement", "Clear status updates for employers and candidates"],
    requirements: ["Employers: a verified organisation account and a clear job description", "Candidates: a profile with accurate details"],
    faqs: [
      ["Do candidates pay for recruitment?", NO_FEES],
      ["Can you guarantee a placement?", "No. We work to find suitable matches, but every hiring decision is the employer's and every acceptance is the candidate's."],
    ],
    cta: { label: "Submit a requirement", href: "/employers/request" },
  },
  {
    slug: "overseas-employment",
    title: "Overseas employment",
    summary:
      "Jobs abroad for welders, fitters, electricians, riggers, scaffolders and other tradespeople. We take care of the whole process, from CV selection and trade tests to visa, medical, documents and flight tickets.",
    publish: true,
    featured: true,
    iconName: "plane",
    enquiryType: "general",
    overview: [
      "Venkat Sai sends trained tradespeople to jobs with employers abroad and takes care of the process from start to finish: CV selection, interviews and trade tests, the employment visa, the medical, documents and flight tickets.",
      "On arrival, employers usually provide food or a food allowance, accommodation, medical insurance and transport to and from work. <strong>Benefits depend on the trade and the employer.</strong> The exact salary, working hours, benefits and contract length are written in your offer letter, and you read them before you accept.",
      "Our candidates work in the United Arab Emirates (Dubai, Abu Dhabi, Sharjah), Saudi Arabia, Qatar, Kuwait, Oman, Bahrain, Europe, Russia, Singapore and Malaysia. The countries open at any time depend on the requirements we have from employers.",
      "Overseas recruitment follows the Emigration Act, 1983 and the rules of the destination country. Selection is the employer's decision and the visa is the destination country's decision, so nobody can honestly guarantee you a job or a visa.",
      `${NO_FEES} If anyone asks you for money for an overseas job, do not pay and report it to us.`,
    ],
    whoItHelps: [
      ["Tradespeople", "Welders, pipe fitters, structural fitters, fabricators, electricians, riggers, scaffolders, mechanical fitters and helpers."],
      ["Freshers with training", "People who have completed trade training and want their first job abroad."],
      ["Overseas employers", "Companies abroad who need tested workers from India."],
    ],
    whatWeProvide: [
      ["CV selection", "We match your CV and trade with current requirements from employers abroad."],
      ["Interviews and trade tests", "We arrange the employer's interview and the practical trade test, and help you prepare for both."],
      ["Employment visa", "We handle the visa process with the employer once you are selected."],
      ["Medical", "We guide you through the medical examination the destination country requires."],
      ["Documentation", "Passport checks, offer letter, contract, emigration clearance where it applies, and PDOT (Pre-Departure Orientation Training)."],
      ["Flight tickets", "We coordinate your travel and joining date with the employer."],
    ],
    processSteps: [
      ["Send your CV and trade", "Share your CV, trade and experience online or on WhatsApp."],
      ["CV selection", "We shortlist you for requirements that match your trade."],
      ["Interview and trade test", "Attend the employer's interview and practical test."],
      ["Offer letter", "Read the salary, benefits and contract terms before you accept."],
      ["Visa, medical and documents", "Complete the medical, documents and visa steps with our help."],
      ["Travel and joining", "PDOT, flight tickets and joining your employer abroad."],
    ],
    benefits: [
      "Food or a food allowance",
      "Accommodation",
      "Medical insurance",
      "Transport to and from work",
      "Benefits depend on the trade and the employer, and are written in your offer letter",
    ],
    requirements: [
      "A valid passport (or an application in progress)",
      "Your CV with your trade and years of experience",
      "Trade certificates and experience letters, if you have them",
    ],
    faqs: [
      ["Do I have to pay a placement fee?", NO_FEES],
      ["Can you guarantee me a job or a visa?", "No. We prepare you and put you forward for suitable requirements, but the employer decides who is selected and the destination country decides on the visa. Be careful of anyone who promises a guaranteed job or visa."],
      ["What benefits will I get abroad?", "Food or a food allowance, accommodation, medical insurance and transport are common, but benefits depend on the trade and the employer. Your offer letter lists them before you accept."],
      ["Which trades do you recruit for?", "Mainly welders (including 6G pipe welders), pipe fitters, structural fitters and fabricators, electricians, riggers, scaffolders, mechanical fitters and helpers. Other trades are taken when employers ask for them."],
      ["Will I need emigration clearance?", "It depends on your passport category and the destination country. We explain what applies to you before you travel."],
      ["How do I check that a recruiting agent is genuine?", "Registered recruiting agents are listed on the Government of India's eMigrate portal. Never pay cash or pay anyone who cannot show a valid registration."],
    ],
    cta: { label: "Send your CV and trade", href: "/send-cv" },
  },
  {
    slug: "domestic-hiring",
    title: "Domestic hiring",
    summary: "Recruitment for employers across India, from single roles to larger teams.",
    publish: true,
    iconName: "building-2",
    enquiryType: "employer",
    overview: [
      "Venkat Sai helps employers in India hire for technical, industrial and office roles, and helps candidates find work closer to home.",
      "Employers can post jobs directly on Venkat Sai Global or ask the Venkat Sai team to manage the search.",
      NO_FEES,
    ],
    whoItHelps: [
      ["Employers in India", "Companies hiring for factories, sites, workshops and offices."],
      ["Candidates", "People looking for jobs in India."],
    ],
    whatWeProvide: [
      ["Job posting", "Post jobs on Venkat Sai Global and receive applications in the Employer Portal."],
      ["Managed search", "The Venkat Sai team searches, screens and shortlists for you."],
      ["Interview coordination", "Scheduling and follow-up with candidates."],
    ],
    processSteps: [
      ["Post or request", "Post a job, or ask Venkat Sai to manage the search."],
      ["Applications and screening", "Candidates apply and are screened."],
      ["Interview and hire", "Interview shortlisted candidates and make an offer."],
    ],
    benefits: ["Reach candidates who are looking for work", "Track applications in one place"],
    requirements: ["A verified employer account to publish jobs"],
    cta: { label: "Hire through Venkat Sai", href: "/employers" },
  },
  {
    slug: "bulk-manpower-supply",
    title: "Manpower supply",
    summary:
      "Skilled and semi-skilled tradespeople for companies in India and abroad. Tell us the trades and how many people you need; we source, test and mobilise them.",
    publish: true,
    featured: true,
    iconName: "users",
    enquiryType: "employer",
    overview: [
      "Companies tell us which trades they need and how many people. Venkat Sai sources suitable workers, tests them practically at our centre in Autonagar, Gajuwaka, Visakhapatnam, and mobilises the selected team to your site in India or abroad.",
      "We supply welders, pipe fitters, structural fitters and fabricators, electricians, riggers, scaffolders, mechanical fitters, helpers and other trades for projects, plant shutdowns, maintenance and long-term contracts.",
      "Each requirement is agreed in writing: trades, numbers, skills, duration, working conditions, and who is responsible for wages, accommodation, safety and statutory compliance.",
      "Workers are never charged placement fees. The employer pays, in line with ethical recruitment practice.",
    ],
    whoItHelps: [
      ["Contractors and EPC companies", "Construction, fabrication, piping and electrical projects that need many workers at once."],
      ["Plants and maintenance teams", "Shutdowns, turnarounds and planned maintenance."],
      ["Overseas employers", "Companies abroad that need tested tradespeople from India."],
    ],
    whatWeProvide: [
      ["Requirement planning", "We confirm the trades, numbers, skill levels and dates with you."],
      ["Sourcing", "Candidates from our trainees and from tradespeople who have registered with us."],
      ["Practical trade tests", "Welding coupons, fit-up tasks and other trade tests at our centre, or in front of your team."],
      ["Mobilisation", "Documents, travel and joining coordinated until the team reaches your site."],
    ],
    processSteps: [
      ["Tell us what you need", "Send the trades and numbers by WhatsApp, phone, email or the requirement form."],
      ["Agree terms", "We agree responsibilities and timelines in writing."],
      ["Source and test", "We shortlist workers and run practical trade tests."],
      ["Select", "You interview or review the results and select the team."],
      ["Mobilise", "Selected workers travel and join your project."],
    ],
    benefits: [
      "One contact for many trades",
      "Workers tested practically before selection",
      "Teams for projects in India and abroad",
      "No placement fees charged to workers",
    ],
    requirements: ["The trades, number of people, location and expected duration", "Working conditions, salary range and benefits for each trade"],
    faqs: [
      ["Which trades can you supply?", "Welders, pipe fitters, structural fitters and fabricators, electricians, riggers, scaffolders, mechanical fitters, helpers and other trades on request."],
      ["Can we test the workers ourselves?", "Yes. Your team can attend the trade tests at our centre or interview candidates by video before selection."],
    ],
    cta: { label: "Submit a manpower requirement", href: "/employers/request" },
  },
  {
    slug: "internships",
    title: "Internships",
    summary:
      "Hands-on internships in our Autonagar workshop for students and freshers, with an offer letter, internship certificate and letter of recommendation.",
    publish: true,
    iconName: "graduation-cap",
    enquiryType: "general",
    tags: ["course-fee"],
    overview: [
      "Venkat Sai offers internships at our workshop in Autonagar, Gajuwaka, Visakhapatnam, for ITI, diploma and engineering students and for recent graduates who want real workshop experience.",
      "Interns work alongside our trainers on welding, fabrication, piping, electrical and testing work, and learn how jobs are planned, done safely and checked.",
      "Every intern receives an offer letter before starting and an internship certificate on completion. A letter of recommendation (LOR) is given based on your attendance and performance.",
      "Internship fees, duration and start dates are confirmed when you enquire.",
    ],
    whoItHelps: [
      ["Students", "ITI, diploma and engineering students in mechanical, electrical, civil and related branches."],
      ["Recent graduates", "Freshers who want practical experience before their first job."],
      ["Colleges", "Institutions arranging internships for their students."],
    ],
    whatWeProvide: [
      ["Offer letter", "A written offer with the internship dates, schedule and fee before you start."],
      ["Hands-on workshop experience", "Practical work in a real workshop, under supervision and with safety training."],
      ["Internship certificate", "A certificate from Venkat Sai when you complete the internship."],
      ["Letter of recommendation (LOR)", "Given based on your attendance and performance."],
    ],
    processSteps: [
      ["Enquire", "Send your details on WhatsApp, by email or with the form."],
      ["Offer letter", "Receive your offer letter with the dates and fee."],
      ["Internship", "Learn and work in our workshop."],
      ["Certificate and LOR", "Receive your internship certificate and, based on performance, an LOR."],
    ],
    requirements: ["Your current course and year of study (or your qualification)", "A college letter, if your college asks for one"],
    cta: { label: "Send your CV", href: "/send-cv" },
  },
  {
    slug: "apprenticeships",
    title: "Apprenticeships",
    summary: "Apprenticeship opportunities that combine on-the-job learning with work.",
    publish: true,
    iconName: "wrench",
    enquiryType: "general",
    overview: [
      "Apprenticeships combine work with structured on-the-job learning. Employers can list apprenticeship openings on Venkat Sai Global and candidates can apply with their profile.",
      "Each listing shows the trade, duration and terms as stated by the employer.",
    ],
    whoItHelps: [
      ["Candidates", "People starting out in a trade who want to learn while they work."],
      ["Employers", "Organisations that want to build skilled teams."],
    ],
    whatWeProvide: [
      ["Apprenticeship listings", "Search apprenticeships by trade and location."],
      ["Applications", "Apply with your profile and track the status."],
    ],
    processSteps: [
      ["Find an apprenticeship", "Search listings by trade."],
      ["Apply", "Apply with your profile."],
      ["Selection", "The employer selects apprentices."],
    ],
    cta: { label: "Find apprenticeships", href: "/jobs?type=apprenticeship" },
  },
  {
    slug: "professional-training",
    title: "Professional training",
    summary: "Courses that help people build skills for work.",
    publish: true,
    iconName: "book-open",
    enquiryType: "general",
    overview: [
      "Venkat Sai Global lists training courses from Venkat Sai and from training institutions. Each course page shows its content, duration, mode and any fee.",
      "Training is always optional: paying for a course is never a condition of applying for a job, receiving an offer or being placed.",
    ],
    whoItHelps: [
      ["Candidates", "People who want to learn a new skill or improve an existing one."],
      ["Employers", "Organisations that want their staff or new hires trained."],
    ],
    whatWeProvide: [
      ["Course listings", "Courses with clear content, schedules and fees."],
      ["Enrolment", "Enrol online and track your progress."],
      ["Certificates", "Certificates for completed courses, with public verification."],
    ],
    processSteps: [
      ["Choose a course", "Compare courses and batches."],
      ["Enrol", "Enrol online."],
      ["Learn and complete", "Attend the course and complete any assessment."],
    ],
    cta: { label: "Browse training", href: "/training" },
  },
  {
    slug: "technical-training",
    title: "Training",
    summary:
      "Practical training in welding, pipe fitting, fabrication, electrical, piping, rigging, scaffolding, safety and more, with a completion certificate and trade test preparation for overseas interviews.",
    publish: true,
    featured: true,
    iconName: "flame",
    enquiryType: "general",
    tags: ["training-hub", "course-fee"],
    overview: [
      "Venkat Sai Welding Works and Testing Center trains tradespeople at our workshop in Autonagar, Gajuwaka, Visakhapatnam. Despite our name, we do much more than welding: we train welders, pipe fitters, structural fitters and fabricators, electricians, piping technicians, riggers, scaffolders and mechanical fitters, with safety and NDT awareness for every trade.",
      "Training is hands-on. You practise on real materials and equipment, under supervision, until you can do the work to the standard employers test for.",
      "Every course ends with a completion certificate from Venkat Sai. We also prepare you for the trade tests used in overseas interviews. Venkat Sai certificates and assessments are our own; they are not presented as an accredited external certification unless that is stated on the certificate.",
      "Course fees, duration and batch timings are confirmed when you enquire. Training is optional and is never a condition of any job application, offer or placement.",
    ],
    whoItHelps: [
      ["Beginners", "People starting a career in a trade."],
      ["Working tradespeople", "Helpers and tradespeople who want to move up, learn a new process or position, or prepare for a trade test."],
      ["Candidates going abroad", "People preparing for overseas interviews and trade tests."],
    ],
    whatWeProvide: [
      ["Hands-on practice", "Most of the time is spent practising in the workshop."],
      ["Trade test preparation", "Practice on the kind of tests employers use in overseas interviews."],
      ["Completion certificate", "A Venkat Sai certificate for every course, which can be checked online."],
      ["Safety first", "PPE and safe working are taught from the first day."],
    ],
    processSteps: [
      ["Enquire", "Tell us your trade and experience on WhatsApp, by phone or with the form."],
      ["Choose a course", "We suggest the course and level that fit you."],
      ["Train", "Attend the batch and practise in the workshop."],
      ["Assessment and certificate", "Complete the course assessment and receive your certificate."],
      ["Trade test and jobs", "If you want to work abroad, send your CV and trade for current requirements."],
    ],
    faqs: [
      ["Do I need experience to join?", "No for beginner courses. For advanced courses, such as 6G pipe welding, we check your current level first."],
      ["Will training get me a job?", "Training improves your skills and your chances in trade tests, but it does not guarantee a job. Employers decide who they select."],
      ["How much does a course cost?", "Fees depend on the course and level and are confirmed when you enquire. Online payment is coming soon."],
    ],
    cta: { label: "See courses and batches", href: "/training" },
  },
  {
    slug: "welding-and-industrial-testing",
    title: "Welding and industrial testing",
    summary: "Testing services at the Venkat Sai Welding Works and Testing Center in Visakhapatnam.",
    publish: true,
    iconName: "shield-check",
    enquiryType: "employer",
    overview: [
      "The Venkat Sai Welding Works and Testing Center in Autonagar, Gajuwaka, Visakhapatnam, tests welders and welded work, and runs the practical trade tests used for overseas and project recruitment.",
      "The tests available, the standards they follow, turnaround times and fees are confirmed when you enquire, so you know exactly what you will receive before work starts.",
      "Results of Venkat Sai tests are reported as Venkat Sai assessments with the procedure used. They are not presented as an accredited external certification unless that is stated on the report.",
    ],
    whoItHelps: [
      ["Employers and contractors", "Organisations that need welders or welded work tested."],
      ["Welders", "Tradespeople who need their skills tested for a job."],
    ],
    whatWeProvide: [
      ["Testing", "Tests carried out at the Venkat Sai Welding Works and Testing Center."],
      ["Clear reports", "Results with the procedure used, and verification of certificates on Venkat Sai Global."],
    ],
    processSteps: [
      ["Enquire", "Tell us what needs to be tested."],
      ["Confirm", "We confirm the test, standard, timeline and fee."],
      ["Test", "The test is carried out."],
      ["Report", "You receive the results."],
    ],
    cta: { label: "Make an enquiry", href: "/contact" },
  },
  {
    slug: "skill-assessment",
    title: "Skill assessment",
    summary: "Practical skill and trade assessments for candidates and employers.",
    publish: true,
    iconName: "clipboard-check",
    enquiryType: "employer",
    overview: [
      "Venkat Sai arranges practical skill and trade assessments so employers can see what a candidate can do, and candidates can show their skills.",
      "When a trade test is part of a job application, it is paid for by the employer or by Venkat Sai, never by the candidate.",
      "Results are labelled as Venkat Sai assessments with the procedure used, and certificates can be checked at /verify-certificate.",
    ],
    whoItHelps: [
      ["Employers", "Hiring teams that want evidence of practical skills before selection."],
      ["Candidates", "People who want verified evidence of their skills on their profile."],
    ],
    whatWeProvide: [
      ["Practical assessments", "Hands-on tests for the trade or skill."],
      ["Results on your profile", "With the candidate's permission, results can be shared with employers."],
      ["Certificate verification", "Anyone can check a Venkat Sai certificate online."],
    ],
    processSteps: [
      ["Schedule", "An assessment is scheduled for the candidate."],
      ["Assess", "The candidate completes the practical test."],
      ["Result", "The result is recorded and, with permission, shared."],
    ],
    cta: { label: "Make an enquiry", href: "/contact" },
  },
  {
    slug: "career-development",
    title: "Career development",
    summary: "Tools and support to help candidates present their skills and plan their next step.",
    publish: true,
    iconName: "compass",
    enquiryType: "candidate_support",
    overview: [
      "Venkat Sai Global gives candidates tools to build a strong profile and resume, and lets them ask the Venkat Sai team for resume reviews, career guidance and interview preparation.",
      "These services are free for candidates.",
    ],
    whoItHelps: [["Candidates", "Anyone building a career, from first job to next role."]],
    whatWeProvide: [
      ["Resume builder", "Create a resume from your profile."],
      ["Resume review and guidance", "Ask the Venkat Sai team for feedback and advice."],
      ["Skill gap insights", "See which skills employers ask for in the roles you want."],
    ],
    processSteps: [
      ["Build your profile", "Add your experience, education and skills."],
      ["Use the tools", "Create a resume and review skill gaps."],
      ["Ask for support", "Request a review or guidance from the People Portal."],
    ],
    cta: { label: "Build your career profile", href: "/sign-up?intent=candidate" },
  },
  // ---- Drafts: published only once the business confirms it offers them ----
  {
    slug: "campus-recruitment",
    title: "Campus recruitment",
    summary: "Hiring drives with colleges and training institutes.",
    publish: false,
    iconName: "school",
    enquiryType: "institution",
    overview: ["Campus recruitment connects employers with students and graduates through drives organised with colleges and training institutes."],
    whoItHelps: [
      ["Institutions", "Colleges and institutes placing their students."],
      ["Employers", "Organisations hiring graduates and trainees."],
    ],
    whatWeProvide: [["Campus drives", "Planning and coordination of drives with institutions."]],
    processSteps: [
      ["Plan", "Agree the roles, eligibility and dates."],
      ["Drive", "Students apply and are assessed."],
      ["Offers", "The employer makes offers."],
    ],
    cta: { label: "Make an enquiry", href: "/contact" },
  },
  {
    slug: "recruitment-management",
    title: "Recruitment management",
    summary: "End-to-end management of an employer's hiring process.",
    publish: false,
    iconName: "layers",
    enquiryType: "employer",
    overview: ["Recruitment management means Venkat Sai runs an employer's hiring process from requirement to joining, with regular reporting."],
    whoItHelps: [["Employers", "Organisations that want one partner to run their hiring."]],
    whatWeProvide: [["Managed hiring", "Sourcing, screening, interviews, offers and joining managed for you."]],
    processSteps: [
      ["Agree scope", "Define roles, volumes and reporting."],
      ["Run hiring", "Venkat Sai manages the process."],
      ["Report", "Regular progress reports."],
    ],
    cta: { label: "Make an enquiry", href: "/contact" },
  },
  {
    slug: "hr-technology",
    title: "HR technology",
    summary: "Hiring tools for employers on the Venkat Sai Global platform.",
    publish: false,
    iconName: "laptop",
    enquiryType: "employer",
    overview: ["Employers can use the Employer Portal to post jobs, search candidates, manage pipelines, schedule interviews and track offers."],
    whoItHelps: [["Employers", "Hiring teams that want their recruitment in one place."]],
    whatWeProvide: [["Employer Portal", "Jobs, candidate search, pipelines, interviews and reports."]],
    processSteps: [
      ["Register", "Create and verify your organisation."],
      ["Set up", "Invite your team."],
      ["Hire", "Post jobs and manage candidates."],
    ],
    cta: { label: "Register as an employer", href: "/sign-up?intent=employer" },
  },
  {
    slug: "corporate-workforce-solutions",
    title: "Corporate workforce solutions",
    summary: "Workforce planning and supply for larger organisations.",
    publish: false,
    iconName: "factory",
    enquiryType: "employer",
    overview: ["Corporate workforce solutions combine recruitment, manpower supply, training and assessment for organisations with ongoing workforce needs."],
    whoItHelps: [["Larger employers", "Organisations with continuing hiring and training needs."]],
    whatWeProvide: [["Combined services", "Recruitment, supply, training and assessment planned together."]],
    processSteps: [
      ["Understand needs", "Review the workforce plan."],
      ["Propose", "Agree the services and terms."],
      ["Deliver", "Deliver and review regularly."],
    ],
    cta: { label: "Make an enquiry", href: "/contact" },
  },
  {
    slug: "employer-recruitment-support",
    title: "Employer recruitment support",
    summary: "Support for employers running their own hiring.",
    publish: false,
    iconName: "handshake",
    enquiryType: "employer",
    overview: ["Employer recruitment support helps employers who run their own hiring with specific steps, such as screening, interview scheduling or trade testing."],
    whoItHelps: [["Employers", "Hiring teams that need help with part of the process."]],
    whatWeProvide: [["Targeted support", "Help with the steps you choose."]],
    processSteps: [
      ["Choose the support", "Tell us which steps you need help with."],
      ["Agree terms", "We confirm scope and fees."],
      ["Support", "We deliver the agreed steps."],
    ],
    cta: { label: "Make an enquiry", href: "/contact" },
  },
  {
    slug: "training-partnerships",
    title: "Training partnerships",
    summary: "Partnerships with training institutions on Venkat Sai Global.",
    publish: false,
    iconName: "award",
    enquiryType: "institution",
    overview: ["Training institutions can list courses, manage batches, issue certificates and connect their students with opportunities through the Institution Portal."],
    whoItHelps: [["Training institutions", "Institutes that want to reach more learners and connect them with employers."]],
    whatWeProvide: [["Institution Portal", "Courses, batches, students, assessments, certificates and placements."]],
    processSteps: [
      ["Register", "Create and verify your institution."],
      ["List courses", "Publish courses after review."],
      ["Connect", "Connect students with opportunities."],
    ],
    cta: { label: "Register your institution", href: "/sign-up?intent=institution" },
  },
  {
    slug: "international-mobility-coordination",
    title: "International mobility coordination",
    summary: "Coordination of documents, approvals and travel for workers moving abroad.",
    publish: false,
    iconName: "globe",
    enquiryType: "employer",
    overview: ["International mobility coordination supports selected candidates and their employers with the documents, approvals, medical checks and travel needed to start work abroad."],
    whoItHelps: [
      ["Overseas employers", "Employers bringing selected workers from India."],
      ["Selected candidates", "Workers preparing to travel for a job."],
    ],
    whatWeProvide: [["Mobilisation tracking", "A checklist of documents and approvals, tracked to departure."]],
    processSteps: [
      ["Checklist", "Agree the documents and approvals needed."],
      ["Track", "Track each step."],
      ["Depart", "Coordinate travel and arrival."],
    ],
    cta: { label: "Make an enquiry", href: "/contact" },
  },
];

const items = (pairs: readonly Pair[]) => pairs.map(([title, description]) => ({ title, description }));

/** The three main services, in display order (featured; everything else is listed under "All services"). */
export const FEATURED_SERVICE_SLUGS = ["overseas-employment", "technical-training", "bulk-manpower-supply"] as const;

function trainingFamilyService(f: TrainingFamilySeed): ServiceSeed {
  return {
    slug: f.slug,
    title: f.title,
    summary: f.summary,
    publish: true,
    iconName: f.iconName,
    enquiryType: "general",
    tags: ["training-course", "course-fee"],
    overview: [f.intro, TRAINING_COMMON_CLOSE, "Training is optional and is never a condition of any job application, offer or placement."],
    whoItHelps: f.whoItHelps,
    whatWeProvide: f.topics,
    processSteps: TRAINING_STEPS,
    benefits: TRAINING_BENEFITS,
    requirements: f.requirements,
    faqs: f.faqs,
    cta: { label: "See courses and batches", href: "/training" },
  };
}

/** Display order: the main services, the other services, then the training course families. */
function orderedServices(): ServiceSeed[] {
  const featured = FEATURED_SERVICE_SLUGS.map((slug) => SERVICES.find((s) => s.slug === slug)!);
  const rest = SERVICES.filter((s) => !featured.includes(s));
  return [...featured, ...rest, ...TRAINING_FAMILIES.map(trainingFamilyService)];
}

export function buildServiceSeeds(): SeedEntrySpec[] {
  return orderedServices().map((s, index) => ({
    collection: "services",
    slug: s.slug,
    title: s.title,
    summary: s.summary,
    sortOrder: (index + 1) * 10,
    isFeatured: s.featured ?? false,
    tags: s.tags ? [...s.tags] : [],
    publish: s.publish,
    note: s.publish ? "Initial service description (claim-free)." : "Draft: publish only once the business confirms this service is offered.",
    data: {
      overview: s.overview.map((p) => `<p>${p}</p>`).join(""),
      whoItHelps: items(s.whoItHelps),
      whatWeProvide: items(s.whatWeProvide),
      processSteps: items(s.processSteps),
      ...(s.benefits ? { benefits: [...s.benefits] } : {}),
      ...(s.requirements ? { requirements: [...s.requirements] } : {}),
      ...(s.faqs ? { faqs: s.faqs.map(([question, answer]) => ({ question, answer })) } : {}),
      enquiryType: s.enquiryType,
      cta: s.cta,
      iconName: s.iconName,
      isActive: true,
    },
  }));
}

export const SERVICE_SLUGS = orderedServices().map((s) => s.slug);
