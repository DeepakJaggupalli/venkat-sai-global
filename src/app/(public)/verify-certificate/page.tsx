import type { Metadata } from "next";

import { TrainingI18n } from "@/components/training/training-i18n";
import { getT } from "@/i18n/server";

import { VerifyFootnote, VerifyHeader } from "./verify-chrome";
import { VerifyCertificateForm } from "./verify-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-training");
  return { title: t("verify.metaTitle"), description: t("verify.metaDescription"), robots: { index: false, follow: false } };
}

/** Public certificate check by verification code (noindex; lookups are rate-limited per network). */
export default async function VerifyCertificatePage() {
  const t = await getT("talent-training");
  return (
    <TrainingI18n className="bg-surface-subtle">
      <VerifyHeader t={t} />
      <div className="container-page max-w-3xl py-6 sm:py-8">
        <VerifyCertificateForm />
        <VerifyFootnote t={t} />
      </div>
    </TrainingI18n>
  );
}
