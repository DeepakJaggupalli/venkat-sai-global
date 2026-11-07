import { ShieldCheck } from "lucide-react";
import Link from "next/link";

type T = (key: string) => string;

/** Header shared by the certificate check pages. */
export function VerifyHeader({ t }: { t: T }) {
  return (
    <section className="border-b bg-navy text-white">
      <div className="container-page max-w-3xl py-8 sm:py-10">
        <p className="flex items-center gap-2 text-sm font-medium text-white/80">
          <ShieldCheck aria-hidden="true" className="size-4" />
          {t("verify.eyebrow")}
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">{t("verify.title")}</h1>
        <p className="mt-2 text-sm text-white/85 sm:text-base">{t("verify.description")}</p>
      </div>
    </section>
  );
}

/** Honesty note and help link under the certificate check. */
export function VerifyFootnote({ t }: { t: T }) {
  return (
    <div className="mt-8 space-y-2 text-sm text-muted-foreground">
      <p>{t("verify.footnoteAssessment")}</p>
      <p>
        {t("verify.footnoteHelp")}{" "}
        <Link href="/contact" className="font-medium text-teal-strong underline-offset-2 hover:underline">
          {t("verify.contactLink")}
        </Link>
      </p>
    </div>
  );
}
