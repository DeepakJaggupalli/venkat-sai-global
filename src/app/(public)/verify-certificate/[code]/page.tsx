import type { Metadata } from "next";

import { Callout } from "@/components/shared/callout";
import { intlLocale } from "@/components/training/training-rules";
import { TrainingI18n } from "@/components/training/training-i18n";
import { VerificationResult } from "@/components/training/verification-result";
import { getLocale, getT } from "@/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { verifyCertificateByCode } from "@/modules/training/certificates";

import { VerifyFootnote, VerifyHeader } from "../verify-chrome";
import { VerifyCertificateForm } from "../verify-form";

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-training");
  return { title: t("verify.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * Share link for a certificate (/verify-certificate/XXXX-XXXX-XXXX). Same rate limit as the form (per network);
 * hidden or unknown codes return the same "not found" answer.
 */
export default async function VerifyCertificateCodePage({ params }: PageProps) {
  const { code: rawCode } = await params;
  let code = rawCode;
  try {
    code = decodeURIComponent(rawCode);
  } catch {
    // Malformed escapes: look the raw value up (it simply will not match).
  }
  code = code.trim().slice(0, 32);
  const [t, locale, meta] = await Promise.all([getT("talent-training"), getLocale(), getRequestMeta()]);
  const limited = await rateLimit(`certificate-verify:${meta.ipHash ?? "unknown"}`, 30, 10 * 60);
  const result = limited.allowed && code.length >= 8 ? await verifyCertificateByCode(code) : limited.allowed ? ({ found: false } as const) : null;

  return (
    <TrainingI18n className="bg-surface-subtle">
      <VerifyHeader t={t} />
      <div className="container-page max-w-3xl space-y-8 py-6 sm:py-8">
        {result ? (
          <VerificationResult t={t} result={result} fmtLocale={intlLocale(locale)} />
        ) : (
          <Callout tone="warning" title={t("verify.rateLimitedTitle")}>
            {t("verify.rateLimitedBody")}
          </Callout>
        )}
        <section aria-labelledby="verify-another" className="space-y-3">
          <h2 id="verify-another" className="font-heading text-base font-semibold text-navy">
            {t("verify.another")}
          </h2>
          <VerifyCertificateForm />
        </section>
        <VerifyFootnote t={t} />
      </div>
    </TrainingI18n>
  );
}
