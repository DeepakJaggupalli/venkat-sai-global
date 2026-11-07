import { BadgeCheck, Mail, Phone } from "lucide-react";
import Link from "next/link";

import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { SectionCard } from "@/components/shared/section-card";
import { ContactMethodForm, LocationsForm, PersonalForm, PreferencesForm, ProfessionalForm } from "@/components/talent/profile/about-forms";
import { EditDialog } from "@/components/talent/profile/dialog";
import { fromMinorUnits } from "@/lib/format";

import { saveContactMethod, savePersonal, savePreferences, savePreferredLocations, saveProfessional } from "../actions";
import type { ContactMethod } from "../_lib/contact-method";
import type { SectionProps } from "../_lib/options";
import { dateText } from "./bits";

const list = (values: string[], empty: string) => (values.length ? values.join(", ") : empty);

/** Personal details, contact, professional summary, job preferences and preferred locations. */
export function AboutSections({ t, loc, detail, options, contactMethod }: SectionProps & { contactMethod: ContactMethod | null }) {
  const { profile, account } = detail;
  const notProvided = t("common.notProvided");
  const countryName = (code: string | null) => (code ? (options.countries.find((c) => c.value === code)?.label ?? code) : null);
  const hasSalary = profile.expectedSalaryMinor !== null && profile.expectedSalaryCurrency && profile.expectedSalaryPeriod;
  const months = profile.totalExperienceMonths;

  return (
    <>
      <SectionCard
        id="personal"
        title={t("section.personal")}
        description={t("section.personal.description")}
        headingLevel="h2"
        action={
          <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${t("section.personal")}`} title={t("section.personal")} description={t("section.personal.dialog")}>
            <PersonalForm
              action={savePersonal}
              countries={options.countries}
              minor={detail.isMinor}
              defaults={{
                legalName: profile.legalName,
                gender: profile.gender,
                genderSelfDescription: profile.genderSelfDescription,
                nationalityCode: profile.nationalityCode,
                currentCountryCode: profile.currentCountryCode,
                stateRegion: profile.stateRegion,
                city: profile.city,
                passportStatus: profile.passportStatus,
                passportNumberLast4: profile.passportNumberLast4 ?? null,
                passportExpiry: profile.passportExpiry,
                emigrationCheckStatus: profile.emigrationCheckStatus,
              }}
            />
          </EditDialog>
        }
      >
        <KeyValueList
          columns={2}
          emptyText={notProvided}
          items={[
            { label: t("field.legalName"), value: profile.legalName },
            { label: t("field.dateOfBirth"), value: dateText(profile.dateOfBirth, loc), hint: t("field.dateOfBirth.locked") },
            { label: t("field.gender"), value: profile.gender ? t(`enum.gender.${profile.gender}`) : null, hint: t("field.gender.private") },
            { label: t("field.nationality"), value: countryName(profile.nationalityCode) },
            { label: t("section.location"), value: [profile.city, profile.stateRegion, countryName(profile.currentCountryCode)].filter(Boolean).join(", ") || null },
            ...(detail.isMinor
              ? []
              : [
                  {
                    label: t("field.passportStatus"),
                    value: profile.passportStatus
                      ? [t(`enum.passportStatus.${profile.passportStatus}`), profile.passportNumberLast4 ? t("field.passportNumber.endsWith", { last4: profile.passportNumberLast4 }) : null, profile.passportExpiry ? t("field.expiresOn", { date: dateText(profile.passportExpiry, loc) ?? "" }) : null]
                          .filter(Boolean)
                          .join(" · ")
                      : null,
                  },
                  { label: t("field.emigration"), value: profile.emigrationCheckStatus ? t(`enum.emigration.${profile.emigrationCheckStatus}`) : null },
                ]),
          ]}
        />
        <div className="mt-6 rounded-lg border bg-surface-subtle p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t("contact.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("contact.description")}</p>
            </div>
            <Link href="/account" className="inline-flex min-h-9 items-center text-sm font-medium text-teal-strong underline underline-offset-2">
              {t("contact.change")}
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex flex-wrap items-center gap-2">
              <Mail aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="break-all">{account.email ?? notProvided}</span>
              {account.email ? <Verified ok={account.emailVerified} t={t} /> : null}
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <Phone aria-hidden="true" className="size-4 text-muted-foreground" />
              <span>{account.phone ?? notProvided}</span>
              {account.phone ? <Verified ok={account.phoneVerified} t={t} /> : null}
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
            <span>
              <span className="text-muted-foreground">{t("field.contactMethod")}: </span>
              {contactMethod ? t(`contactMethod.${contactMethod}`) : notProvided}
            </span>
            <EditDialog triggerLabel={t("action.change")} srLabel={`${t("action.change")}: ${t("field.contactMethod")}`} title={t("field.contactMethod")} size="sm">
              <ContactMethodForm action={saveContactMethod} value={contactMethod} />
            </EditDialog>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        id="professional"
        title={t("section.professional")}
        description={t("section.professional.description")}
        headingLevel="h2"
        action={
          <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${t("section.professional")}`} title={t("section.professional")}>
            <ProfessionalForm
              action={saveProfessional}
              industries={options.industries}
              defaults={{
                headline: profile.headline,
                about: profile.about,
                careerObjective: profile.careerObjective,
                experienceLevel: profile.experienceLevel,
                totalExperienceMonths: profile.totalExperienceMonths,
                currentJobTitle: profile.currentJobTitle,
                currentEmployerName: profile.currentEmployerName,
                industryId: profile.industryId,
                noticePeriodDays: profile.noticePeriodDays,
                suggestedExperienceMonths: detail.suggestedExperienceMonths,
              }}
            />
          </EditDialog>
        }
      >
        <KeyValueList
          columns={2}
          emptyText={notProvided}
          items={[
            { label: t("field.headline"), value: profile.headline, fullWidth: true },
            { label: t("field.about"), value: profile.about ? <span className="whitespace-pre-line">{profile.about}</span> : null, fullWidth: true },
            { label: t("field.objective"), value: profile.careerObjective ? <span className="whitespace-pre-line">{profile.careerObjective}</span> : null, fullWidth: true },
            { label: t("field.experienceLevel"), value: profile.experienceLevel ? t(`enum.experienceLevel.${profile.experienceLevel}`) : null },
            { label: t("field.totalExperience"), value: months === null ? null : t("field.totalExperience.value", { years: Math.floor(months / 12), months: months % 12 }) },
            { label: t("field.currentJobTitle"), value: profile.currentJobTitle },
            { label: t("field.currentEmployer"), value: profile.currentEmployerName },
            { label: t("field.industry"), value: options.industries.find((i) => i.value === profile.industryId)?.label ?? null },
            { label: t("field.noticePeriod"), value: profile.noticePeriodDays === null ? null : t("field.noticePeriod.value", { count: profile.noticePeriodDays }) },
          ]}
        />
      </SectionCard>

      <SectionCard
        id="preferences"
        title={t("section.preferences")}
        description={t("section.preferences.description")}
        headingLevel="h2"
        action={
          <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${t("section.preferences")}`} title={t("section.preferences")}>
            <PreferencesForm
              action={savePreferences}
              categories={options.categories}
              currencies={options.currencies}
              minor={detail.isMinor}
              defaults={{
                preferredCategories: detail.preferredCategories.map((c) => ({ value: c.id, label: c.name })),
                preferredRoles: [...profile.preferredRoles],
                desiredEmploymentTypes: [...profile.desiredEmploymentTypes],
                preferredWorkModes: [...profile.preferredWorkModes],
                availability: profile.availability,
                availableFrom: profile.availableFrom,
                expectedSalaryAmount: hasSalary ? fromMinorUnits(Number(profile.expectedSalaryMinor), profile.expectedSalaryCurrency!) : null,
                expectedSalaryCurrency: profile.expectedSalaryCurrency,
                expectedSalaryPeriod: profile.expectedSalaryPeriod,
                willingToRelocate: profile.willingToRelocate,
                openToOverseas: profile.openToOverseas,
              }}
            />
          </EditDialog>
        }
      >
        <KeyValueList
          columns={2}
          emptyText={notProvided}
          items={[
            { label: t("field.preferredCategories"), value: detail.preferredCategories.length ? detail.preferredCategories.map((c) => c.name).join(", ") : null },
            { label: t("field.preferredRoles"), value: profile.preferredRoles.length ? profile.preferredRoles.join(", ") : null },
            { label: t("field.employmentTypes"), value: list(profile.desiredEmploymentTypes.map((v) => t(`enum.employmentType.${v}`)), notProvided) },
            { label: t("field.workModes"), value: list(profile.preferredWorkModes.map((v) => t(`enum.workMode.${v}`)), notProvided) },
            {
              label: t("field.availability"),
              value: profile.availability ? [t(`enum.availability.${profile.availability}`), profile.availableFrom ? t("field.fromDate", { date: dateText(profile.availableFrom, loc) ?? "" }) : null].filter(Boolean).join(" · ") : null,
            },
            {
              label: t("field.expectedSalary"),
              value: hasSalary ? (
                <span>
                  <MoneyText amountMinor={Number(profile.expectedSalaryMinor)} currency={profile.expectedSalaryCurrency!} locale={loc} /> {t(`salary.per.${profile.expectedSalaryPeriod}`)}
                </span>
              ) : null,
            },
            { label: t("field.willingToRelocate"), value: profile.willingToRelocate ? t("common.yes") : t("common.no") },
            { label: t("field.openToOverseas"), value: detail.isMinor ? t("profile.overseasMinorShort") : profile.openToOverseas ? t("common.yes") : t("common.no") },
          ]}
        />
        <div id="locations" className="mt-6 scroll-mt-24 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t("locations.title")}</h3>
            <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${t("locations.title")}`} title={t("locations.title")}>
              <LocationsForm action={savePreferredLocations} countries={options.countries} defaults={detail.preferredLocations.map((l) => ({ countryCode: l.countryCode, stateRegion: l.stateRegion, city: l.city }))} />
            </EditDialog>
          </div>
          {detail.preferredLocations.length ? (
            <ol className="mt-2 flex flex-wrap gap-2">
              {detail.preferredLocations.map((l) => (
                <li key={l.id} className="rounded-full border bg-background px-3 py-1 text-sm">
                  {[l.city, l.stateRegion, l.countryName ?? l.countryCode].filter(Boolean).join(", ")}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("locations.empty")}</p>
          )}
        </div>
      </SectionCard>
    </>
  );
}

function Verified({ ok, t }: { ok: boolean; t: SectionProps["t"] }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-strong">
      <BadgeCheck aria-hidden="true" className="size-3.5" />
      {t("contact.verified")}
    </span>
  ) : (
    <Link href="/account" className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-strong underline-offset-2 hover:underline">
      {t("contact.verify")}
    </Link>
  );
}
