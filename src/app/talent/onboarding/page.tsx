import { CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Stepper } from "@/components/shared/stepper";
import { DateOfBirthForm, GuardianConsentForm } from "@/components/talent/onboarding/age-forms";
import {
  AvailabilityForm,
  BasicsForm,
  GoalsForm,
  ResumeStepForm,
  SkillsStepForm,
  SkipStepButton,
  TrackOnce,
  VisibilityStepForm,
} from "@/components/talent/onboarding/step-forms";
import { ONBOARDING_STEPS, allowedGoals, resolveOnboardingStep, type OnboardingStep } from "@/components/talent/onboarding/steps";
import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";
import { getFile, toFileSummary } from "@/modules/files";
import { countryOptions, currencyOptions, getSkillsByIds, jobCategoryOptions } from "@/modules/taxonomy/queries";

import {
  saveAvailabilityAction,
  saveBasicsAction,
  saveDateOfBirthAction,
  saveGoalsAction,
  saveGuardianConsentAction,
  saveResumeStepAction,
  saveSkillsStepAction,
  saveVisibilityStepAction,
  skipStepAction,
} from "./actions";
import { getAgeGateForCandidate, getOnboardingState, preferencesInputFrom } from "./_lib/state";
import { listOwnSkillIds } from "./_lib/skills";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-profile");
  return { title: t("onboarding.title") };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * /talent/onboarding — age gate first (DPDP Rules 2025: date of birth, then guardian consent for a
 * child), then a progressive, skippable set of steps saved one at a time (spec 8.1). Returning
 * candidates resume at the first step they have neither saved nor skipped; ?step= revisits one.
 * Documents are never demanded here.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireCandidate();
  const { candidate } = session;
  const [t, params, gate] = await Promise.all([getT("talent-profile"), searchParams, getAgeGateForCandidate(session.candidate)]);

  // ---- Age gate ---------------------------------------------------------------------------------
  if (gate.state !== "complete") {
    const askDob = gate.state === "needs_dob" || sp(params, "step") === "age";
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title={t("onboarding.age.title")} description={t("onboarding.age.description")} />
        <Callout tone="info" title={t("onboarding.age.whyTitle")} icon={<ShieldCheck aria-hidden="true" className="size-5" />}>
          <p>{t("onboarding.age.why")}</p>
        </Callout>
        {askDob ? (
          <SectionCard title={t("onboarding.age.dobTitle")} headingLevel="h2">
            <DateOfBirthForm action={saveDateOfBirthAction} defaultValue={candidate.dateOfBirth} maxDate={todayIso()} />
          </SectionCard>
        ) : (
          <>
            <Callout tone="warning" title={t("onboarding.guardian.title")}>
              <p>{t("onboarding.guardian.explanation")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>{t("onboarding.guardian.rule1")}</li>
                <li>{t("onboarding.guardian.rule2")}</li>
                <li>{t("onboarding.guardian.rule3")}</li>
              </ul>
            </Callout>
            <SectionCard title={t("onboarding.guardian.formTitle")} description={t("onboarding.guardian.formDescription")} headingLevel="h2">
              <GuardianConsentForm action={saveGuardianConsentAction} />
            </SectionCard>
            <p className="text-sm text-muted-foreground">
              {t("onboarding.guardian.wrongDob")}{" "}
              <Link href="/talent/onboarding?step=age" className="font-medium text-teal-strong underline underline-offset-2">
                {t("onboarding.guardian.changeDob")}
              </Link>
            </p>
          </>
        )}
      </div>
    );
  }

  // ---- Progressive steps ------------------------------------------------------------------------
  const state = await getOnboardingState(session.user.id);
  const current = resolveOnboardingStep(sp(params, "step"), state);
  const stepItems = ONBOARDING_STEPS.map((id) => ({ id, label: t(`onboarding.step.${id}`), href: `/talent/onboarding?step=${id}` }));
  const skip = (step: OnboardingStep) => <SkipStepButton action={skipStepAction} step={step} />;

  let body: ReactNode;
  if (current === "done") {
    body = (
      <SectionCard title={t("onboarding.done.title")} icon={<CheckCircle2 aria-hidden="true" className="size-5 text-success-strong" />} headingLevel="h2">
        <TrackOnce enabled={!gate.minor} event="form_submitted" form="talent_onboarding" />
        <p className="text-muted-foreground">{t("onboarding.done.description")}</p>
        {state.skipped.length ? (
          <div className="mt-4">
            <p className="text-sm font-medium">{t("onboarding.done.skipped")}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {state.skipped.map((step) => (
                <li key={step}>
                  <Link href={`/talent/onboarding?step=${step}`} className="inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium hover:bg-muted">
                    {t(`onboarding.step.${step}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/talent/profile">{t("onboarding.done.profile")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/talent/jobs">{t("onboarding.done.jobs")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/talent/training">{t("onboarding.done.training")}</Link>
          </Button>
        </div>
      </SectionCard>
    );
  } else {
    body = (
      <SectionCard title={t(`onboarding.step.${current}`)} description={t(`onboarding.step.${current}.description`)} headingLevel="h2">
        <StepBody step={current} session={session} goals={state.goals} minor={gate.minor} skip={skip(current)} />
      </SectionCard>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrackOnce enabled={!gate.minor && state.completed.length === 0 && state.skipped.length === 0} event="form_started" form="talent_onboarding" />
      <PageHeader
        title={t("onboarding.title")}
        description={t("onboarding.description")}
        breadcrumbs={[{ label: t("breadcrumb.portal"), href: "/talent" }, { label: t("onboarding.title") }]}
        actions={current === "done" ? undefined : { label: t("onboarding.finishLater"), href: "/talent", variant: "outline" }}
      />
      <Stepper steps={stepItems} current={current === "done" ? ONBOARDING_STEPS.length : current} completed={[...state.completed]} label={t("onboarding.progress")} />
      {gate.minor ? (
        <Callout tone="info" title={t("onboarding.minor.title")} icon={<UserRound aria-hidden="true" className="size-5" />}>
          <p>{t("onboarding.minor.description")}</p>
        </Callout>
      ) : null}
      {body}
    </div>
  );
}

async function StepBody({
  step,
  session,
  goals,
  minor,
  skip,
}: {
  step: OnboardingStep;
  session: Awaited<ReturnType<typeof requireCandidate>>;
  goals: Parameters<typeof GoalsForm>[0]["goals"];
  minor: boolean;
  skip: ReactNode;
}) {
  const { candidate } = session;
  switch (step) {
    case "goals":
      return <GoalsForm action={saveGoalsAction} goals={goals} allowed={allowedGoals(minor)} minor={minor} skip={skip} />;
    case "basics": {
      const [countries, categories] = await Promise.all([countryOptions(), jobCategoryOptions()]);
      const chosen = new Set(candidate.preferredCategoryIds);
      return (
        <BasicsForm
          action={saveBasicsAction}
          countries={countries}
          categories={categories}
          skip={skip}
          defaults={{
            currentCountryCode: candidate.currentCountryCode,
            stateRegion: candidate.stateRegion,
            city: candidate.city,
            experienceLevel: candidate.experienceLevel,
            preferredCategories: categories.filter((c) => chosen.has(c.value)),
            preferredRoles: [...candidate.preferredRoles],
          }}
        />
      );
    }
    case "skills": {
      const rows = await getSkillsByIds(await listOwnSkillIds(candidate.id));
      return <SkillsStepForm action={saveSkillsStepAction} skills={rows.map((s) => ({ value: s.id, label: s.name }))} skip={skip} />;
    }
    case "availability": {
      const prefs = preferencesInputFrom(candidate);
      return (
        <AvailabilityForm
          action={saveAvailabilityAction}
          currencies={await currencyOptions()}
          minor={minor}
          skip={skip}
          defaults={{
            availability: prefs.availability ?? null,
            desiredEmploymentTypes: prefs.desiredEmploymentTypes,
            preferredWorkModes: prefs.preferredWorkModes,
            willingToRelocate: prefs.willingToRelocate,
            openToOverseas: prefs.openToOverseas,
            expectedSalaryAmount: prefs.expectedSalaryAmount ?? null,
            expectedSalaryCurrency: prefs.expectedSalaryCurrency ?? null,
            expectedSalaryPeriod: prefs.expectedSalaryPeriod ?? null,
          }}
        />
      );
    }
    case "resume": {
      const file = candidate.resumeFileId ? await getFile(candidate.resumeFileId) : null;
      return <ResumeStepForm action={saveResumeStepAction} resume={file ? toFileSummary(file) : null} skip={skip} />;
    }
    case "visibility":
      return <VisibilityStepForm action={saveVisibilityStepAction} visibility={candidate.visibility} isOpenToWork={candidate.isOpenToWork} skip={skip} />;
  }
}
