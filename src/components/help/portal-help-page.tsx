import { LifeBuoy, MessageSquare, Phone, UserRound } from "lucide-react";
import Link from "next/link";

import { PORTAL_LABEL, PORTAL_HOME } from "@/config/navigation";
import { CONTACT, telHref, whatsappHref } from "@/config/contact";
import { guideFor, type GuidePortalKey } from "@/config/portal-guides";
import { PORTAL_SUPPORT_HREF } from "@/components/layout/portal-config";
import { WhatsAppIcon } from "@/components/public/contact-links";

import { HelpBrowser } from "./help-browser";

export type PortalHelpPageProps = {
  portal: GuidePortalKey;
  /** Viewer's permissions (sections their role cannot use are left out); null for the People Portal. */
  permissions: readonly string[] | ReadonlySet<string> | null;
};

const PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The "How to use" page of a portal: heading, search + table of contents, every section with plain steps and
 * links, common questions, and how to get help (WhatsApp for external portals; "ask your manager or the owner"
 * for staff). Content comes from src/config/portal-guides.ts. Server component; the page calls its own guard.
 */
export function PortalHelpPage({ portal, permissions }: PortalHelpPageProps) {
  const guide = guideFor(portal, permissions);
  const hidden = permissions !== null && guide.sections.length < guideFor(portal, null).sections.length;
  const sections = guide.sections.map(({ icon: Icon, faqs, ...section }) => ({ ...section, icon: <Icon />, faqs: faqs ?? [] }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="label-dot">{PORTAL_LABEL[portal]}</p>
        <h1 className="font-display text-[1.875rem] leading-[1.08] text-balance text-foreground sm:text-[2.5rem]">{guide.title}</h1>
        <p className="max-w-2xl text-[15px] text-pretty text-muted-foreground sm:text-base">{guide.intro}</p>
        {hidden ? <p className="max-w-2xl text-sm text-muted-foreground">Some areas are not shown because your role does not include them.</p> : null}
      </header>

      <HelpBrowser sections={sections} faqs={guide.faqs} searchExample={guide.searchExample} />

      {portal === "admin" ? <StaffHelp /> : <ExternalHelp portal={portal} />}
    </div>
  );
}

function StaffHelp() {
  return (
    <section aria-labelledby="need-help-title" className="rounded-[22px] border border-border bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="need-help-title" className="font-heading text-lg font-bold text-foreground sm:text-xl">
            Still stuck?
          </h2>
          <p className="mt-1 text-[15px] text-pretty text-muted-foreground">Ask your manager or the owner. If a page shows an error, give them the reference code on it.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link href="/admin/messages" className={`${PILL} bg-foreground text-white hover:bg-navy-deep`}>
          <MessageSquare aria-hidden="true" className="size-4" />
          Open messages
        </Link>
        <Link href={PORTAL_HOME.admin} className={`${PILL} border border-border bg-white text-foreground hover:bg-surface-subtle`}>
          Back to the dashboard
        </Link>
      </div>
    </section>
  );
}

function ExternalHelp({ portal }: { portal: Exclude<GuidePortalKey, "admin"> }) {
  // Companies and travel agencies talk to the business desk; everyone else to the main office number.
  const business = portal === "employer" || portal === "agency";
  const number = business ? { e164: CONTACT.business.e164, display: CONTACT.business.display } : CONTACT.whatsapp;
  const message = `Hello Venkat Sai, I need help with the ${PORTAL_LABEL[portal]}.`;
  return (
    <section aria-labelledby="need-help-title" className="rounded-[22px] border border-border bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e7f6ec] text-green-strong">
          <WhatsAppIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="need-help-title" className="font-heading text-lg font-bold text-foreground sm:text-xl">
            Need help? WhatsApp us
          </h2>
          <p className="mt-1 text-[15px] text-pretty text-muted-foreground">
            Message the Venkat Sai office on WhatsApp{business ? ` (${CONTACT.business.name}, business desk)` : ""} at{" "}
            <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">{number.display}</span>. For a problem we should track, send a support request.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a href={whatsappHref(message, number.e164)} target="_blank" rel="noopener noreferrer" className={`${PILL} bg-foreground text-white hover:bg-navy-deep`}>
          <WhatsAppIcon className="size-[18px]" />
          WhatsApp us
          <span className="sr-only"> (opens WhatsApp)</span>
        </a>
        <a href={telHref(number.e164)} className={`${PILL} border border-border bg-white text-foreground hover:bg-surface-subtle`}>
          <Phone aria-hidden="true" className="size-4" />
          Call {number.display}
        </a>
        <Link href={`${PORTAL_SUPPORT_HREF[portal]}/new`} className={`${PILL} border border-border bg-white text-foreground hover:bg-surface-subtle`}>
          <LifeBuoy aria-hidden="true" className="size-4" />
          Send a support request
        </Link>
      </div>
    </section>
  );
}
