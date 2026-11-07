import type { SeedEntrySpec } from "./types";

/**
 * The 18 services of the product specification (§7.5). Copy is deliberately plain and claim-free: it says what
 * the service is and how it works, never how many people were placed or which clients were served.
 *
 * Published: services that reflect existing business activities (overseas recruitment, manpower supply, welding
 * training and testing) or platform functionality available at launch (job board, applications, internships,
 * apprenticeships, courses, assessments, career tools). The other seven stay drafts until the business confirms
 * it offers them.
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
    summary: "Recruitment of candidates from India for employers abroad, with support through documentation and travel.",
    publish: true,
    iconName: "plane",
    enquiryType: "general",
    overview: [
      "Venkat Sai recruits candidates for employers outside India and supports selected candidates through documentation, pre-departure steps and travel.",
      "Overseas recruitment follows the Emigration Act, 1983 and the rules of the destination country. Where a registered recruiting agent is involved, the agent's name and registration number are shown on the job.",
      `${NO_FEES} If anyone asks you for money for an overseas job, do not pay and report it to us.`,
    ],
    whoItHelps: [
      ["Candidates", "Skilled and semi-skilled workers and professionals interested in working abroad."],
      ["Overseas employers", "Employers abroad who need workers from India."],
    ],
    whatWeProvide: [
      ["Overseas job listings", "Jobs abroad with the employment terms stated by the employer."],
      ["Selection", "Interviews and practical trade tests arranged for the employer."],
      ["Documentation support", "Guidance on the documents, medical checks and approvals each destination requires."],
      ["Pre-departure support", "PDOT (Pre-Departure Orientation Training) information and travel coordination."],
    ],
    processSteps: [
      ["Apply", "Apply for an overseas job on Venkat Sai Global."],
      ["Selection", "Interview and, where required, a trade test."],
      ["Offer and documents", "Accept the offer and complete the documents, medical and approvals."],
      ["Departure", "Pre-departure orientation and travel."],
    ],
    benefits: ["Clear information about the job and its terms before you apply", "Help with documentation and approvals", "No fees for candidates"],
    requirements: ["A valid passport (or an application in progress)", "The qualifications and experience the job asks for"],
    faqs: [
      ["Will I need emigration clearance?", "It depends on your passport category and the destination country. We explain what applies to you before you travel."],
      ["How do I check that a recruiting agent is genuine?", "Registered recruiting agents are listed on the Government of India's eMigrate portal. Never pay cash or pay anyone who cannot show a valid registration."],
    ],
    cta: { label: "View overseas jobs", href: "/jobs?overseas=1" },
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
    title: "Bulk manpower supply",
    summary: "Supply of skilled and semi-skilled workers for projects, shutdowns and large hiring needs.",
    publish: true,
    iconName: "users",
    enquiryType: "employer",
    overview: [
      "Venkat Sai supplies teams of skilled and semi-skilled workers for projects, plant shutdowns and other large requirements, in India and abroad.",
      "Each requirement is agreed in writing, including the trades, numbers, duration, working conditions and who is responsible for wages, safety and statutory compliance.",
      NO_FEES,
    ],
    whoItHelps: [
      ["Contractors and project owners", "Construction, fabrication, maintenance and industrial projects that need many workers at once."],
      ["Workers", "Tradespeople looking for project work."],
    ],
    whatWeProvide: [
      ["Requirement planning", "Trades, numbers, skills and timelines agreed with you."],
      ["Sourcing and trade testing", "Workers sourced and, where needed, practically tested for the trade."],
      ["Mobilisation", "Coordination of joining, documents and travel."],
    ],
    processSteps: [
      ["Submit a requirement", "List the trades and numbers you need."],
      ["Agreement", "We agree terms, responsibilities and timelines in writing."],
      ["Sourcing and testing", "Workers are sourced and tested."],
      ["Mobilisation", "Selected workers join the project."],
    ],
    benefits: ["One requirement for many trades", "Practical trade tests before selection where needed"],
    requirements: ["A written requirement with trades, numbers, location and duration"],
    cta: { label: "Submit a workforce requirement", href: "/employers/request" },
  },
  {
    slug: "internships",
    title: "Internships",
    summary: "Internship opportunities for students and recent graduates.",
    publish: true,
    iconName: "graduation-cap",
    enquiryType: "general",
    overview: [
      "Students and recent graduates can find internships on Venkat Sai Global, and employers can offer internships to gain early talent.",
      "Internship listings show the duration, location and whether a stipend is offered, as stated by the employer.",
    ],
    whoItHelps: [
      ["Students and graduates", "People who want practical experience in their field."],
      ["Employers", "Organisations that want to train and assess early talent."],
      ["Institutions", "Colleges and training institutes placing their students."],
    ],
    whatWeProvide: [
      ["Internship listings", "Search internships by field and location."],
      ["Applications", "Apply with your Venkat Sai Global profile."],
    ],
    processSteps: [
      ["Create a profile", "Add your education and skills."],
      ["Find an internship", "Search and apply."],
      ["Interview", "The employer reviews your application and contacts you."],
    ],
    requirements: ["Candidates: a profile with your current education details"],
    cta: { label: "Find internships", href: "/jobs?type=internship" },
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
    title: "Technical training",
    summary: "Practical training for technical and industrial trades, including welding.",
    publish: true,
    iconName: "flame",
    enquiryType: "general",
    overview: [
      "Venkat Sai provides practical training for welders, building on the work of the Venkat Sai Welding Works and Testing Center in Visakhapatnam. Other technical courses are listed on Venkat Sai Global as they become available.",
      "Course pages give the syllabus, duration, schedule and fee. Training is optional and never a condition of any job application, offer or placement.",
    ],
    whoItHelps: [
      ["Trainees", "People starting a career in welding and other industrial trades."],
      ["Working tradespeople", "People who want to improve their skills."],
    ],
    whatWeProvide: [
      ["Hands-on practice", "Practical training in a workshop setting."],
      ["Assessment", "A practical assessment at the end of the course, where the course includes one."],
    ],
    processSteps: [
      ["Enquire or enrol", "Choose a course and batch."],
      ["Train", "Attend practical sessions."],
      ["Assessment", "Complete the course assessment."],
    ],
    requirements: ["Safety equipment and rules are explained at the start of each course"],
    cta: { label: "Browse training", href: "/training" },
  },
  {
    slug: "welding-and-industrial-testing",
    title: "Welding and industrial testing",
    summary: "Testing services at the Venkat Sai Welding Works and Testing Center in Visakhapatnam.",
    publish: true,
    iconName: "shield-check",
    enquiryType: "employer",
    overview: [
      "The Venkat Sai Welding Works and Testing Center in Auto Nagar, Visakhapatnam, provides welding and industrial testing services.",
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

export function buildServiceSeeds(): SeedEntrySpec[] {
  return SERVICES.map((s, index) => ({
    collection: "services",
    slug: s.slug,
    title: s.title,
    summary: s.summary,
    sortOrder: (index + 1) * 10,
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

export const SERVICE_SLUGS = SERVICES.map((s) => s.slug);
