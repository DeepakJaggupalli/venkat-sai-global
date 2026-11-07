import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { catalogueFilterOptions, loadCatalogue, parseCatalogueParams } from "@/components/training/catalogue-server";
import { CourseCatalogue } from "@/components/training/course-catalogue";
import { TrainingI18n } from "@/components/training/training-i18n";
import { getLocale, getT } from "@/i18n/server";
import { parsePage, type SearchParams } from "@/lib/http";

type PageProps = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const [t, sp] = await Promise.all([getT("talent-training"), searchParams]);
  const filtered = Object.keys(sp).some((k) => k !== "page");
  return {
    title: t("public.metaTitle"),
    description: t("public.metaDescription"),
    alternates: { canonical: "/training" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

/**
 * Public training catalogue: published courses of Venkat Sai and verified institutions, open batches first.
 * Browsing is free; enrolling needs an account.
 */
export default async function PublicTrainingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const [t, locale] = await Promise.all([getT("talent-training"), getLocale()]);
  const query = parseCatalogueParams(sp);
  const [result, options] = await Promise.all([loadCatalogue(query, parsePage(sp, { defaultSize: 12, maxSize: 48 })), catalogueFilterOptions(t, locale)]);

  return (
    <TrainingI18n className="bg-surface-subtle">
      <section className="border-b bg-navy text-white">
        <div className="container-page py-8 sm:py-10">
          <p className="text-sm font-medium text-white/80">{t("public.eyebrow")}</p>
          <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">{t("public.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">{t("public.description")}</p>
          <p className="mt-4 inline-flex max-w-2xl items-start gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("public.honesty")}{" "}
              <Link href="/verify-certificate" className="font-medium underline underline-offset-2">
                {t("public.verifyLink")}
              </Link>
            </span>
          </p>
        </div>
      </section>
      <div className="container-page py-6 sm:py-8">
        <CourseCatalogue
          result={result}
          options={options}
          courseHref={(slug) => `/training/${slug}`}
          pathname="/training"
          searchParams={sp}
          hasFilters={query.hasFilters}
          emptyAction={{ label: t("public.emptyAction"), href: "/contact" }}
        />
      </div>
    </TrainingI18n>
  );
}
