import type { ReactNode } from "react";

import type { SelectOption } from "@/components/shared/types";
import type { TFunction } from "@/i18n/server";
import { cn } from "@/lib/utils";
import type { CandidateProfileDetail } from "@/modules/candidates/types";

export type ResumeTemplate = "classic" | "compact";

function Section({ title, compact, children }: { title: string; compact: boolean; children: ReactNode }) {
  return (
    <section className={compact ? "mt-4" : "mt-6"}>
      <h2 className={cn("border-b border-foreground/40 pb-1 font-heading font-bold uppercase tracking-wide", compact ? "text-xs" : "text-sm")}>{title}</h2>
      <div className={compact ? "mt-2 space-y-2" : "mt-3 space-y-3"}>{children}</div>
    </section>
  );
}

function monthYear(iso: string | null, loc: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(loc, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

function period(start: string | null, end: string | null, current: boolean, loc: string, present: string): string {
  const from = monthYear(start, loc);
  const to = current ? present : monthYear(end, loc);
  return [from, to].filter(Boolean).join(" – ");
}

/**
 * The resume itself. Both templates are single-column with plain text and standard section
 * headings (what applicant tracking systems parse best); "compact" tightens spacing and puts
 * skills first for trade roles. Only the candidate's own, non-sensitive data is used: no date of
 * birth, gender, passport or document numbers.
 */
export function ResumeSheet({
  template,
  detail,
  t,
  tp,
  loc,
  countries,
}: {
  template: ResumeTemplate;
  detail: CandidateProfileDetail;
  t: TFunction;
  tp: TFunction;
  loc: string;
  countries: SelectOption[];
}) {
  const { profile, account } = detail;
  const compact = template === "compact";
  const country = (code: string | null) => (code ? (countries.find((c) => c.value === code)?.label ?? code) : null);
  const name = profile.legalName || account.displayName;
  const location = [profile.city, profile.stateRegion, country(profile.currentCountryCode)].filter(Boolean).join(", ");
  const contact = [account.email, account.phone, location].filter(Boolean);
  const present = t("career.resume.present");
  const verifiedCredentials = detail.credentials;
  const passedAssessments = detail.assessments.filter((a) => a.result === "pass");

  const skills = detail.skills.length ? (
    <Section compact={compact} title={t("career.resume.skills")}>
      <p className="text-sm">
        {detail.skills
          .map((s) => [s.name, s.level ? tp(`enum.skillLevel.${s.level}`) : null, s.yearsExperience !== null ? tp("skills.years", { count: s.yearsExperience }) : null].filter(Boolean).join(" – "))
          .join(" · ")}
      </p>
    </Section>
  ) : null;

  return (
    <article
      id="resume-sheet"
      aria-label={t("career.resume.sheetLabel")}
      className={cn("mx-auto max-w-[210mm] rounded-xl border bg-white text-black shadow-sm", compact ? "p-6 text-[13px] leading-snug sm:p-8" : "p-6 text-sm leading-relaxed sm:p-10")}
    >
      <header>
        <h1 className={cn("font-heading font-bold", compact ? "text-2xl" : "text-3xl")}>{name}</h1>
        {profile.headline ? <p className={compact ? "text-sm" : "mt-1 text-base"}>{profile.headline}</p> : null}
        {contact.length ? <p className="mt-1 break-words">{contact.join(" | ")}</p> : null}
      </header>

      {profile.about || profile.careerObjective ? (
        <Section compact={compact} title={t("career.resume.summary")}>
          {profile.about ? <p className="whitespace-pre-line">{profile.about}</p> : null}
          {profile.careerObjective ? <p className="whitespace-pre-line">{profile.careerObjective}</p> : null}
        </Section>
      ) : null}

      {compact ? skills : null}

      {detail.experience.length ? (
        <Section compact={compact} title={t("career.resume.experience")}>
          {detail.experience.map((e) => (
            <div key={e.id}>
              <p className="font-semibold">
                {e.jobTitle}
                {e.employerName ? `, ${e.employerName}` : ""}
              </p>
              <p>{[period(e.startDate, e.endDate, e.isCurrent, loc, present), [e.city, country(e.countryCode)].filter(Boolean).join(", ")].filter(Boolean).join(" | ")}</p>
              {e.responsibilities ? <p className="mt-1 whitespace-pre-line">{e.responsibilities}</p> : null}
              {e.achievements ? <p className="mt-1 whitespace-pre-line">{e.achievements}</p> : null}
              {!compact && e.projects ? <p className="mt-1 whitespace-pre-line">{e.projects}</p> : null}
            </div>
          ))}
        </Section>
      ) : null}

      {detail.education.length ? (
        <Section compact={compact} title={t("career.resume.education")}>
          {detail.education.map((e) => (
            <div key={e.id}>
              <p className="font-semibold">{[e.qualification || e.qualificationType?.name || e.educationLevel?.name, e.specialisation].filter(Boolean).join(", ") || e.institutionName}</p>
              <p>{[e.institutionName, e.boardOrUniversity, period(e.startDate, e.endDate, e.isCurrent, loc, present), e.gradeOrScore].filter(Boolean).join(" | ")}</p>
            </div>
          ))}
        </Section>
      ) : null}

      {compact ? null : skills}

      {verifiedCredentials.length || passedAssessments.length ? (
        <Section compact={compact} title={t("career.resume.credentials")}>
          {verifiedCredentials.map((c) => (
            <p key={c.id}>
              <span className="font-semibold">{c.name}</span>
              {[c.issuer, monthYear(c.issuedAt, loc), c.verificationStatus === "verified" ? t("career.resume.verifiedByVs") : null].filter(Boolean).map((part) => ` – ${part}`)}
            </p>
          ))}
          {passedAssessments.map((a) => (
            <p key={a.id}>
              <span className="font-semibold">
                {t("career.resume.assessment")}: {a.trade}
              </span>
              {[a.standardReference, a.code].filter(Boolean).map((part) => ` – ${part}`)}
            </p>
          ))}
        </Section>
      ) : null}

      {detail.languages.length ? (
        <Section compact={compact} title={t("career.resume.languages")}>
          <p>{detail.languages.map((l) => `${l.name} (${tp(`enum.proficiency.${l.proficiency}`)})`).join(" · ")}</p>
        </Section>
      ) : null}

      {detail.portfolio.some((p) => p.isPublic) && !compact ? (
        <Section compact={compact} title={t("career.resume.projects")}>
          {detail.portfolio
            .filter((p) => p.isPublic)
            .map((p) => (
              <p key={p.id}>
                <span className="font-semibold">{p.title}</span>
                {p.description ? ` – ${p.description.slice(0, 240)}` : ""}
              </p>
            ))}
        </Section>
      ) : null}
    </article>
  );
}
