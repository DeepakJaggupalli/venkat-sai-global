import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { catalogueFilterOptions, loadCatalogue, parseCatalogueParams } from "@/components/training/catalogue-server";
import { CourseCatalogue } from "@/components/training/course-catalogue";
import { getLocale, getT } from "@/i18n/server";
import { parsePage, type SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";

type PageProps = { searchParams: Promise<SearchParams> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-training");
  return { title: t("talent.discoverTitle") };
}

/** Course discovery inside the People Portal (same catalogue as the public site; links stay in the portal). */
export default async function TalentCoursesPage({ searchParams }: PageProps) {
  await requireCandidate();
  const sp = await searchParams;
  const [t, locale] = await Promise.all([getT("talent-training"), getLocale()]);
  const query = parseCatalogueParams(sp);
  const [result, options] = await Promise.all([loadCatalogue(query, parsePage(sp, { defaultSize: 12, maxSize: 48 })), catalogueFilterOptions(t, locale)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("talent.discoverTitle")}
        description={t("talent.discoverDescription")}
        breadcrumbs={[{ label: t("talent.title"), href: "/talent/training" }, { label: t("talent.discoverTitle") }]}
      />
      <CourseCatalogue
        result={result}
        options={options}
        courseHref={(slug) => `/talent/training/courses/${slug}`}
        pathname="/talent/training/courses"
        searchParams={sp}
        hasFilters={query.hasFilters}
        emptyAction={{ label: t("talent.viewAssessments"), href: "/talent/assessments" }}
      />
    </div>
  );
}
