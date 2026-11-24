import { Download, Mail, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import type { DataTableColumn } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/config/contact";
import { CV_SUBMISSION_SOURCE_LABELS, CV_SUBMISSION_STATUS_LABELS, CV_SUBMISSION_STATUS_TONE, CV_SUBMISSION_STATUS_VALUES } from "@/modules/operations/cv-submission-schemas";
import type { CvSubmissionListItem } from "@/modules/operations/cv-submissions";

import { setCvSubmissionStatusAction } from "../actions";

const statusOptions = CV_SUBMISSION_STATUS_VALUES.map((value) => ({ value, label: CV_SUBMISSION_STATUS_LABELS[value] }));

/** Tap targets: 44px on phones and tablets (cards), compact in the desktop table. */
const TAP = "min-h-11 lg:min-h-8";

/** The candidate's WhatsApp chat (wa.me with their own number) with a short greeting. */
export function candidateWhatsApp(item: Pick<CvSubmissionListItem, "name" | "phone" | "tradeLabel" | "requirementTitle">): string | null {
  if (!item.phone) return null;
  const about = item.requirementTitle ? `your application for ${item.requirementTitle}` : `the CV you sent for ${item.tradeLabel}`;
  return whatsappHref(`Hello ${item.name}, this is Venkat Sai Global about ${about}.`, item.phone);
}

/** wa.me message asking a candidate who applied without a CV to send it. */
export function askForCvWhatsApp(item: Pick<CvSubmissionListItem, "name" | "phone" | "tradeLabel" | "requirementTitle" | "code">): string | null {
  if (!item.phone) return null;
  const about = item.requirementTitle ?? item.tradeLabel;
  return whatsappHref(
    `Hello ${item.name}, this is Venkat Sai Global. Thank you for applying for ${about}. Please send your CV here on WhatsApp (a photo or PDF is fine). Your reference is ${item.code}.`,
    item.phone,
  );
}

function years(value: number | null): string | null {
  return value === null ? null : `${value} ${value === 1 ? "yr" : "yrs"}`;
}

/** "Abroad 5 yrs · India 3 yrs" for the phone cards ("8 yrs in total" for older rows without the split). */
function experienceSummary(s: CvSubmissionListItem): string | null {
  const parts = [s.experienceAbroadYears !== null ? `Abroad ${years(s.experienceAbroadYears)}` : null, s.experienceIndiaYears !== null ? `India ${years(s.experienceIndiaYears)}` : null].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return s.experienceYears !== null ? `${years(s.experienceYears)} in total` : null;
}

function PassportCell({ s }: { s: CvSubmissionListItem }) {
  if (s.passportDisplay) {
    return (
      <span className="font-mono text-sm whitespace-nowrap" data-testid={s.passportFull ? "passport-full" : "passport-masked"}>
        {s.passportDisplay}
      </span>
    );
  }
  if (s.hasPassport === false) return <span className="text-muted-foreground">No passport</span>;
  if (s.hasPassport === true) return <span className="text-muted-foreground">Yes, no number</span>;
  return null;
}

function PhoneCell({ s }: { s: CvSubmissionListItem }) {
  if (!s.phone) return <span className="font-mono text-xs text-muted-foreground">{s.phoneMasked}</span>;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs whitespace-nowrap text-foreground">{s.phone}</span>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className={TAP}>
          <a href={`tel:${s.phone}`} aria-label={`Call ${s.name}`}>
            <Phone aria-hidden="true" />
            Call
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" className={`${TAP} text-success-strong`}>
          <a href={candidateWhatsApp(s)!} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${s.name} (opens WhatsApp)`} data-testid="cv-whatsapp">
            <MessageCircle aria-hidden="true" />
            WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}

function CvAndStatusCell({ s, canManage }: { s: CvSubmissionListItem; canManage: boolean }) {
  const ask = !s.hasCv ? askForCvWhatsApp(s) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {s.cvUrl ? (
        <Button asChild variant="outline" size="sm" className={TAP}>
          <a href={s.cvUrl} data-testid="cv-download">
            <Download aria-hidden="true" />
            CV
            <span className="sr-only"> of {s.name}</span>
          </a>
        </Button>
      ) : !s.hasCv ? (
        ask ? (
          <Button asChild variant="outline" size="sm" className={TAP}>
            <a href={ask} target="_blank" rel="noopener noreferrer" data-testid="ask-cv-whatsapp">
              <MessageCircle aria-hidden="true" />
              Ask for CV
              <span className="sr-only"> from {s.name} on WhatsApp</span>
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">No CV yet</span>
        )
      ) : (
        <span className="text-xs text-muted-foreground">{s.cvBlocked ? "CV waiting for the security scan" : "No access to CVs"}</span>
      )}
      {canManage ? (
        <ResponsiveDialog
          title={`Update ${s.name}`}
          description="Record the outcome of your call or WhatsApp message. Add remarks on the detail page."
          trigger={
            <Button variant="outline" size="sm" className={TAP} data-testid="cv-status">
              Status
            </Button>
          }
        >
          <ActionForm action={setCvSubmissionStatusAction} hidden={{ id: s.id }} submitLabel="Save" fields={[{ name: "status", label: "Status", kind: "select", required: true, options: statusOptions, defaultValue: s.status }]} />
        </ResponsiveDialog>
      ) : null}
    </div>
  );
}

/**
 * Applicant columns shared by the CV submissions list and a poster's applicants page: S.No, Name, Trade, Passport No,
 * Exp abroad, Exp India, Email, Phone (call / WhatsApp), Applied for, Applied on, Status, then CV and status actions.
 * Below the lg breakpoint the table becomes cards (pass stackBelow="lg"; S.No before the name, both experience figures
 * in one field).
 */
export function applicantColumns(opts: { offset: number; canManage: boolean; showRequirement?: boolean }): DataTableColumn<CvSubmissionListItem>[] {
  const showRequirement = opts.showRequirement ?? true;
  const sno = (i: number) => opts.offset + i + 1;
  const columns: (DataTableColumn<CvSubmissionListItem> | null)[] = [
    { id: "sno", header: "S.No", hideOnMobile: true, align: "right", className: "w-12", cell: (_s, i) => sno(i) },
    {
      id: "name",
      header: "Name",
      primary: true,
      cell: (s, i) => (
        <div className="min-w-0" data-testid="cv-row">
          <span className="text-muted-foreground tabular-nums lg:hidden">{sno(i)}. </span>
          <Link href={`/admin/cv-submissions/${s.id}`} className="font-medium text-navy underline-offset-4 hover:underline" data-testid="cv-open">
            {s.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {s.code}
            {s.source !== "website" ? ` · ${CV_SUBMISSION_SOURCE_LABELS[s.source]}` : ""}
            {s.referralCode ? ` · Referred (${s.referralCode})` : ""}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {!s.hasCv ? (
              <StatusBadge tone="neutral" size="sm">
                No CV yet
              </StatusBadge>
            ) : null}
            {s.passportExpiringSoon ? (
              <StatusBadge tone="warning" size="sm">
                Passport expires {s.passportExpiry}
              </StatusBadge>
            ) : null}
          </div>
        </div>
      ),
    },
    { id: "trade", header: "Trade", cell: (s) => s.tradeLabel },
    { id: "passport", header: "Passport No", cell: (s) => <PassportCell s={s} /> },
    { id: "abroad", header: "Exp abroad", hideOnMobile: true, nowrap: true, cell: (s) => years(s.experienceAbroadYears) ?? (s.experienceIndiaYears === null && s.experienceYears !== null ? <span className="text-xs text-muted-foreground">{years(s.experienceYears)} total</span> : null) },
    { id: "india", header: "Exp India", hideOnMobile: true, nowrap: true, cell: (s) => years(s.experienceIndiaYears) },
    { id: "experience", header: "Experience", hideOnDesktop: true, cell: (s) => experienceSummary(s) },
    {
      id: "email",
      header: "Email",
      cell: (s) =>
        s.email ? (
          <a href={`mailto:${s.email}`} className="inline-flex min-h-11 items-center gap-1 break-all text-navy underline-offset-4 hover:underline lg:min-h-0">
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            {s.email}
          </a>
        ) : (
          (s.emailMasked ?? null)
        ),
    },
    { id: "phone", header: "Phone", cell: (s) => <PhoneCell s={s} /> },
    showRequirement ? { id: "requirement", header: "Applied for", cell: (s) => s.requirementTitle ?? <span className="text-muted-foreground">General</span> } : null,
    { id: "date", header: "Applied on", nowrap: true, cell: (s) => <DateText value={s.createdAt} /> },
    { id: "status", header: "Status", cell: (s) => <StatusBadge tone={CV_SUBMISSION_STATUS_TONE[s.status]} size="sm">{CV_SUBMISSION_STATUS_LABELS[s.status]}</StatusBadge> },
    { id: "actions", header: "CV and status", cell: (s) => <CvAndStatusCell s={s} canManage={opts.canManage} /> },
  ];
  return columns.filter((c): c is DataTableColumn<CvSubmissionListItem> => c !== null);
}
