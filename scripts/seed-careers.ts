/**
 * Openings at Venkat Sai's own office, as real job posts of Venkat Sai's own employer organisation (listed on
 * /careers and the job board; applicants use the normal apply flow and land in the admin pipeline).
 *
 *   npm run db:seed:careers            (same environment as `npm run db:seed`: DATABASE_URL, SEED_ADMIN_EMAIL)
 *
 * 1. Finds or creates the employer organisation "Venkat Sai Welding Works and Testing Center" (Autonagar,
 *    Gajuwaka, Visakhapatnam) through the organisations service, marks a newly created (draft) record verified
 *    as the platform operator's own organisation, and stores its id in the setting `careers.organization_id`.
 *    An organisation that staff have suspended, rejected or otherwise changed is never touched.
 * 2. Creates and publishes each post through the jobs module (createJob → publishJob), so validation,
 *    sanitising, codes, listing dates and the audit trail apply unchanged.
 *
 * Idempotent and insert-only: a post whose slug (title + city, before the job number) already exists for the
 * organisation, in any status including binned, is skipped and never touched, so staff edits always win.
 * A second run creates nothing.
 *
 * Facts kept honest: on site at the Autonagar, Gajuwaka office; no salary figures (salary not disclosed, as per
 * experience); no invented hours, openings counts, stipends or deadlines.
 *
 * Actions are recorded in the audit log as the Super Admin named by SEED_ADMIN_EMAIL (or CAREERS_SEED_EMAIL),
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

const ORG_NAME = "Venkat Sai Welding Works and Testing Center";
const OFFICE = "Autonagar, Gajuwaka, Visakhapatnam";
const CITY = "Visakhapatnam";
const STATE = "Andhra Pradesh";

const SALARY_NOTE = "<p><strong>Salary:</strong> not disclosed here; as per experience, discussed at the interview.</p>";
const PROCESS = `Apply here on Venkat Sai Global. Our office team reviews every application and calls shortlisted candidates to arrange an interview at the office in ${OFFICE}. Applying is free.`;

type PostSpec = {
  title: string;
  employmentType: "full_time" | "internship";
  summary: string;
  descriptionHtml: string;
  responsibilities: string[];
  qualifications: string[];
  benefits?: string[];
};

const POSTS: PostSpec[] = [
  {
    title: "Computer Operator - Data Entry and Office Administration",
    employmentType: "full_time",
    summary: `Office role at our office in ${OFFICE}: data entry of candidate records and documents, Excel sheets and registers, scanning, filing and letters. Freshers welcome.`,
    descriptionHtml: [
      `<p>Venkat Sai Welding Works and Testing Center is looking for a computer operator for its office in ${OFFICE}. You will keep candidate records and documents accurate and organised, and support our recruitment team every day.</p>`,
      "<p><strong>Freshers are welcome.</strong> If you are careful with details and comfortable with MS Excel and Word, we will show you how our records and documents work.</p>",
      SALARY_NOTE,
    ].join("\n"),
    responsibilities: [
      "Enter candidate records and documents accurately",
      "Maintain Excel sheets and office registers",
      "Scan, file and keep track of candidate documents",
      "Prepare letters and other office documents",
      "Coordinate with the recruitment team on candidate files and daily work",
    ],
    qualifications: ["Graduate or diploma holder", "Working knowledge of MS Excel and MS Word", "Good typing and accuracy with details", "Freshers welcome"],
  },
  {
    title: "Tele-Recruitment Executive (Candidate Coordination)",
    employmentType: "full_time",
    summary: `Call candidates about openings and interviews, follow up for documents and keep call records up to date, from our office in ${OFFICE}. Telugu, Hindi and basic English. Freshers welcome.`,
    descriptionHtml: [
      `<p>Venkat Sai Welding Works and Testing Center is looking for a tele-recruitment executive for its office in ${OFFICE}. You will be the voice candidates hear from us: calling them about openings and interviews, following up for documents and keeping our call records up to date.</p>`,
      "<p><strong>Freshers are welcome.</strong> You need to speak Telugu and Hindi, with basic English.</p>",
      SALARY_NOTE,
    ].join("\n"),
    responsibilities: [
      "Call candidates about current openings and interview schedules",
      "Follow up with candidates for pending documents",
      "Update call records after every call",
      "Coordinate with the recruitment team on employers' requirements",
    ],
    qualifications: ["Speaks Telugu and Hindi, with basic English", "Clear and polite on the phone", "Comfortable updating call records on a computer", "Freshers welcome"],
  },
  {
    title: "Internship - Office Administration and Recruitment Operations",
    employmentType: "internship",
    summary: `For students: hands-on work in recruitment operations, documentation and coordination at our office in ${OFFICE}. Offer letter at joining and internship certificate on completion. Duration flexible, 1 to 3 months.`,
    descriptionHtml: [
      `<p>An internship for students who want real office experience. You work with our recruitment and office team in ${OFFICE} on recruitment operations, documentation and coordination.</p>`,
      "<ul><li>Offer letter when you join</li><li>Internship certificate when you complete the internship</li><li>Letter of recommendation for good performance</li></ul>",
      "<p><strong>Duration:</strong> flexible, 1 to 3 months.</p>",
    ].join("\n"),
    responsibilities: [
      "Support the recruitment team with candidate records and documents",
      "Help with documentation, filing and data entry",
      "Coordinate with candidates for documents and interview schedules",
    ],
    qualifications: ["Open to students", "Willing to learn and careful with details"],
    benefits: ["Offer letter at joining", "Internship certificate on completion", "Letter of recommendation for good performance"],
  },
];

function redactUrl(url: string): string {
  return url.replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const bullets = (lines: string[]): string => lines.map((l) => `- ${l}`).join("\n");

async function main(): Promise<number> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(root, process.env.NODE_ENV !== "production", { info: () => undefined, error: console.error });
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local (or set it in the environment).");
    return 1;
  }
  console.log(`Careers openings on ${redactUrl(process.env.DATABASE_URL)}`);

  const { and, asc, eq, isNull, like } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { jobs, organizations, roles, userRoles, users } = await import("@/db/schema");
  const { CONTACT } = await import("@/config/contact");
  const { slugify } = await import("@/lib/http");
  const { audit } = await import("@/modules/audit");
  const { createJob } = await import("@/modules/jobs/job-service");
  const { publishJob } = await import("@/modules/jobs/lifecycle-service");
  const { jobFormSchema } = await import("@/modules/jobs/schemas");
  const { organizationDetailsSchema } = await import("@/modules/organizations/schemas");
  const { createOrganization } = await import("@/modules/organizations/service");
  const { getSetting, setSetting } = await import("@/modules/settings");
  type StaffContext = import("@/modules/identity/authz").StaffContext;
  type JobActor = import("@/modules/jobs/types").JobActor;

  const counts = { created: 0, skipped: 0, failed: 0 };

  try {
    // ---- Actor (audit trail) -------------------------------------------------------------------------------
    const email = (process.env.CAREERS_SEED_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
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
      permissions: new Set(["jobs.view", "jobs.manage", "jobs.approve"]),
      isSuperAdmin: true,
    };
    const staff: JobActor = { kind: "staff", ctx };
    console.log(`Acting as ${actor.displayName} (Super Admin)`);

    // ---- Venkat Sai's own employer organisation ------------------------------------------------------------
    const savedId = await getSetting("careers.organization_id");
    const notDeletedEmployer = and(eq(organizations.type, "employer"), isNull(organizations.deletedAt));
    const [saved] = /^[0-9a-f-]{36}$/i.test(savedId) ? await db.select().from(organizations).where(and(eq(organizations.id, savedId), notDeletedEmployer)).limit(1) : [];
    const [byName] = saved ? [saved] : await db.select().from(organizations).where(and(eq(organizations.name, ORG_NAME), notDeletedEmployer)).orderBy(asc(organizations.createdAt)).limit(1);
    let org = byName;
    if (org) {
      console.log(`  [found] organisation ${org.name} (${org.status})`);
    } else {
      const details = organizationDetailsSchema.parse({
        name: ORG_NAME,
        description: `Venkat Sai's own office in ${OFFICE}. Openings at the office are listed on the Careers page.`,
        email: CONTACT.emails.primary,
        phone: CONTACT.whatsapp.e164,
        countryCode: "IN",
        stateRegion: STATE,
        city: CITY,
        addressLine1: "B-Block, Plot D-6, Autonagar",
        addressLine2: "Gajuwaka",
        postalCode: "530012",
      });
      org = await createOrganization("employer", details, { id: actor.id, status: "active" }, { createdByUserId: actor.id });
      console.log(`  [created] organisation ${org.name}`);
    }
    if (org.status === "draft") {
      // The platform operator's own record: there is no third party to verify, so it is marked verified directly (audited).
      const orgId = org.id;
      await db.transaction(async (tx) => {
        await tx
          .update(organizations)
          .set({ status: "verified", statusReason: "Venkat Sai's own organisation (platform operator)", verifiedAt: new Date(), verificationExpiresAt: null })
          .where(eq(organizations.id, orgId));
        await audit({
          action: "organization.verified",
          entityType: "organization",
          entityId: orgId,
          organizationId: orgId,
          actorUserId: actor.id,
          actorType: "staff",
          metadata: { source: "db:seed:careers", reason: "Venkat Sai's own organisation" },
          tx,
        });
      });
      org = { ...org, status: "verified" };
      console.log("  [verified] organisation marked verified (Venkat Sai's own organisation)");
    } else if (org.status !== "verified") {
      console.error(`  [stopped] ${org.name} is ${org.status}; staff changed it, so it is left as it is and no posts are published.`);
      return 1;
    }
    if (savedId !== org.id) {
      await setSetting("careers.organization_id", org.id, actor.id);
      console.log(`  [setting] careers.organization_id = ${org.id}`);
    }

    // ---- Posts (published in reverse, so /careers lists them newest first in this order) ------------------
    for (const spec of [...POSTS].reverse()) {
      const base = slugify(`${spec.title} ${CITY}`, 70);
      const [existing] = await db
        .select({ code: jobs.code, slug: jobs.slug, status: jobs.status, deletedAt: jobs.deletedAt })
        .from(jobs)
        .where(and(eq(jobs.organizationId, org.id), like(jobs.slug, `${base}-%`)))
        .limit(1);
      if (existing) {
        counts.skipped += 1;
        console.log(`  [skipped] ${spec.title} - already exists (${existing.code}, /jobs/${existing.slug}, ${existing.deletedAt ? "in the bin" : existing.status})`);
        continue;
      }
      let createdCode: string | null = null;
      try {
        const input = jobFormSchema.parse({
          title: spec.title,
          summary: spec.summary,
          descriptionHtml: spec.descriptionHtml,
          responsibilities: bullets(spec.responsibilities),
          qualificationsText: bullets(spec.qualifications),
          employmentType: spec.employmentType,
          workMode: "on_site",
          experienceLevel: "fresher",
          salaryVisible: false,
          benefits: spec.benefits ?? [],
          countryCode: "IN",
          stateRegion: STATE,
          city: CITY,
          recruitmentProcess: PROCESS,
          applyMode: "platform",
          organizationId: org.id,
        });
        const job = await createJob(staff, input);
        createdCode = job.code;
        const published = await publishJob(staff, job.id, { infoVerified: true });
        counts.created += 1;
        console.log(`  [created] ${spec.title} - ${job.code}, /jobs/${published.slug}, ${published.status}`);
      } catch (error) {
        counts.failed += 1;
        const hint = createdCode ? ` (job ${createdCode} was created as a draft: finish it in the Command Centre under Jobs)` : "";
        console.error(`  [failed] ${spec.title} - ${message(error)}${hint}`);
      }
    }
  } catch (error) {
    console.error("Careers openings failed:", error instanceof Error ? (error.stack ?? error.message) : error);
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }

  console.log(`Careers openings finished: ${counts.created} created, ${counts.skipped} skipped (already exist), ${counts.failed} failed.`);
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
