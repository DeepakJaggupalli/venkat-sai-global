import { Award, ExternalLink } from "lucide-react";

import { FileLink } from "@/components/files";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { EMPLOYMENT_TYPE_LABELS } from "@/components/employer/labels";
import type { CandidateView } from "@/modules/candidates/types";

import { labelFor, LANGUAGE_PROFICIENCY_LABELS } from "./labels";

const RESULT_TONE = { pass: "success", fail: "danger", retest: "warning", pending: "neutral" } as const;
const RESULT_LABEL = { pass: "Passed", fail: "Not passed", retest: "Retest advised", pending: "Result pending" } as const;

function period(start: string | null, end: string | null, current: boolean) {
  return (
    <span className="text-sm text-muted-foreground">
      <DateText value={start} dateOnly fallback="Start not given" /> – {current ? "Present" : <DateText value={end} dateOnly fallback="End not given" />}
    </span>
  );
}

/** Text the candidate wrote; plain text, line breaks kept. */
function Prose({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-sm whitespace-pre-line text-foreground/90">{text}</p>;
}

export function ExperienceSection({ view }: { view: CandidateView }) {
  return (
    <SectionCard title="Work experience">
      {view.experience.length === 0 ? (
        <EmptyState size="sm" variant="plain" title="No work experience added" description="The candidate may be a fresher or has not added experience yet." />
      ) : (
        <ol className="space-y-5">
          {view.experience.map((e) => (
            <li key={e.id} className="space-y-1.5 border-l-2 border-teal/40 pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-sm font-semibold">{e.jobTitle}</h3>
                <VerificationBadge state={e.verificationStatus} />
              </div>
              <p className="text-sm">
                {e.employerName ?? "Employer not disclosed"}
                {e.employmentType ? ` · ${EMPLOYMENT_TYPE_LABELS[e.employmentType] ?? e.employmentType}` : ""}
                {e.city || e.countryCode ? ` · ${[e.city, e.countryCode].filter(Boolean).join(", ")}` : ""}
              </p>
              {period(e.startDate, e.endDate, e.isCurrent)}
              <Prose text={e.responsibilities} />
              {e.achievements ? <Prose text={`Achievements: ${e.achievements}`} /> : null}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

export function EducationSection({ view }: { view: CandidateView }) {
  return (
    <SectionCard title="Education">
      {view.education.length === 0 ? (
        <EmptyState size="sm" variant="plain" title="No education added" />
      ) : (
        <ul className="space-y-4">
          {view.education.map((e) => (
            <li key={e.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-sm font-semibold">{e.qualification ?? e.educationLevel?.name ?? "Qualification"}</h3>
                <VerificationBadge state={e.verificationStatus} />
              </div>
              <p className="text-sm">
                {e.institutionName}
                {e.specialisation ? ` · ${e.specialisation}` : ""}
              </p>
              {period(e.startDate, e.endDate, e.isCurrent)}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function SkillsSection({ view }: { view: CandidateView }) {
  return (
    <SectionCard title="Skills and languages">
      {view.skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No skills added.</p>
      ) : (
        <ul aria-label="Skills" className="flex flex-wrap gap-2">
          {view.skills.map((s) => (
            <li key={s.skillId} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm">
              {s.name}
              {s.level ? <span className="text-xs text-muted-foreground">· {s.level}</span> : null}
              {s.yearsExperience ? <span className="text-xs text-muted-foreground">· {s.yearsExperience} yrs</span> : null}
              {s.verified ? (
                <StatusBadge tone="success" size="sm" srPrefix="Skill">
                  {s.source === "assessment" ? "Assessed by Venkat Sai" : "Verified"}
                </StatusBadge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {view.languages.length ? (
        <div className="mt-5">
          <h3 className="mb-2 font-heading text-sm font-semibold">Languages</h3>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {view.languages.map((l) => (
              <li key={l.code}>
                {l.name} <span className="text-muted-foreground">· {labelFor(LANGUAGE_PROFICIENCY_LABELS, l.proficiency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}

export function AssessmentsSection({ view }: { view: CandidateView }) {
  return (
    <SectionCard title="Venkat Sai assessments" description="Trade and skill tests run by Venkat Sai Welding Works and Testing Center. These are Venkat Sai assessments, not accredited certifications.">
      {view.assessments.length === 0 ? (
        <EmptyState size="sm" variant="plain" icon={<Award aria-hidden />} title="No shared assessment results" description="Results appear only when the candidate passed and agreed to share them." />
      ) : (
        <ul className="divide-y">
          {view.assessments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">{a.label}</p>
                <h3 className="font-heading text-sm font-semibold">
                  {a.trade}
                  {a.skill ? ` · ${a.skill.name}` : ""}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {[a.process, a.position, a.standardReference ? `Procedure ${a.standardReference}` : null].filter(Boolean).join(" · ") || a.assessmentType}
                </p>
                <p className="text-xs text-muted-foreground">
                  Reference {a.code} · <DateText value={a.completedAt} fallback="Date not recorded" />
                </p>
              </div>
              <div className="text-right">
                <StatusBadge tone={RESULT_TONE[a.result]} size="sm">
                  {RESULT_LABEL[a.result]}
                </StatusBadge>
                {a.score !== null && a.maxScore ? (
                  <p className="mt-1 text-sm tabular-nums">
                    {a.score} / {a.maxScore}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function CredentialsSection({ view }: { view: CandidateView }) {
  if (!view.credentials.length) return null;
  return (
    <SectionCard title="Certificates and licences">
      <ul className="divide-y">
        {view.credentials.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0">
            <div>
              <h3 className="font-heading text-sm font-semibold">{c.name}</h3>
              <p className="text-sm text-muted-foreground">
                {c.issuer ?? "Issuer not given"}
                {c.issuedAt ? (
                  <>
                    {" "}
                    · issued <DateText value={c.issuedAt} dateOnly />
                  </>
                ) : null}
                {c.expiresAt ? (
                  <>
                    {" "}
                    · expires <DateText value={c.expiresAt} dateOnly />
                  </>
                ) : null}
              </p>
            </div>
            <VerificationBadge state={c.verificationStatus} label={c.verificationStatus === "verified" ? "Verified by Venkat Sai" : undefined} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function PortfolioSection({ view }: { view: CandidateView }) {
  if (!view.portfolio.length) return null;
  return (
    <SectionCard title="Work samples">
      <ul className="grid gap-4 sm:grid-cols-2">
        {view.portfolio.map((p) => (
          <li key={p.id} className="space-y-2 rounded-lg border p-3">
            <h3 className="font-heading text-sm font-semibold">{p.title}</h3>
            {p.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{p.description}</p> : null}
            <ul className="space-y-1">
              {p.media.map((m) => (
                <li key={m.id}>
                  <FileLink file={m} />
                </li>
              ))}
            </ul>
            {p.videoUrl ? (
              <a href={p.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-teal-strong underline-offset-4 hover:underline">
                Watch video <ExternalLink aria-hidden className="size-3.5" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function DocumentsSection({ view, entitled }: { view: CandidateView; entitled: boolean }) {
  const files = view.documents.filter((d) => d.file);
  return (
    <SectionCard title="Resume and documents" description={entitled ? "Shared by the candidate with employers they applied to or that unlocked their profile." : undefined}>
      {!entitled ? (
        <p className="text-sm text-muted-foreground">Documents are shared only after the candidate applies to your job or you unlock the profile, and only those the candidate marked as shareable.</p>
      ) : !view.resume && files.length === 0 ? (
        <p className="text-sm text-muted-foreground">The candidate has not shared a resume or documents.</p>
      ) : (
        <ul className="space-y-2">
          {view.resume ? (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Resume</span>
              <FileLink file={view.resume} />
            </li>
          ) : null}
          {files.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm">
                {d.title ?? labelFor({}, d.documentType)}
                <VerificationBadge state={d.verificationStatus} />
              </span>
              {d.file ? <FileLink file={d.file} /> : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function AboutSection({ view }: { view: CandidateView }) {
  if (!view.about && !view.careerObjective) return null;
  return (
    <SectionCard title="About">
      <div className="space-y-3">
        <Prose text={view.about} />
        {view.careerObjective ? (
          <div>
            <h3 className="mb-1 font-heading text-sm font-semibold">Career objective</h3>
            <Prose text={view.careerObjective} />
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

