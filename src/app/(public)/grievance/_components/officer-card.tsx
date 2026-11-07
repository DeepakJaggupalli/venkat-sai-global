import { Clock, Mail, MapPin, Phone, UserRound } from "lucide-react";

import type { CollectionData } from "@/modules/content/collections";

import { telHref } from "../../news/_lib/text";

type Officer = NonNullable<CollectionData<"site_settings">>["grievanceOfficer"] | null | undefined;

/** Hours as words: whole days when divisible by 24 ("2 days"), otherwise hours. */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** The grievance officer published in site settings, or an honest "not yet published" note. */
export function GrievanceOfficerCard({ officer, headingLevel = "h2" }: { officer: Officer; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  const hasOfficer = Boolean(officer?.name || officer?.email);
  return (
    <section aria-labelledby="grievance-officer-title" className="rounded-xl border border-border/80 bg-card p-6" data-testid="grievance-officer">
      <Heading id="grievance-officer-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
        <UserRound className="size-5 text-teal" aria-hidden="true" />
        Grievance officer
      </Heading>
      {hasOfficer && officer ? (
        <dl className="mt-4 space-y-3 text-sm">
          {officer.name ? (
            <div>
              <dt className="sr-only">Name</dt>
              <dd className="font-semibold text-foreground">{officer.name}</dd>
              {officer.designation ? <dd className="text-muted-foreground">{officer.designation}</dd> : null}
            </div>
          ) : null}
          {officer.email ? (
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="sr-only">Email</dt>
                <dd>
                  <a href={`mailto:${officer.email}`} className="font-medium break-all text-teal-strong hover:underline">
                    {officer.email}
                  </a>
                </dd>
              </div>
            </div>
          ) : null}
          {officer.phone ? (
            <div className="flex items-start gap-2">
              <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="sr-only">Phone</dt>
                <dd>
                  <a href={telHref(officer.phone)} className="font-medium text-teal-strong hover:underline">
                    {officer.phone}
                  </a>
                </dd>
              </div>
            </div>
          ) : null}
          {officer.address ? (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="sr-only">Postal address</dt>
                <dd className="whitespace-pre-line">{officer.address}</dd>
              </div>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          The grievance officer&apos;s contact details will be published here once appointed. Until then, grievances raised through the form on this page go
          directly to our grievance team and follow the same timelines.
        </p>
      )}
    </section>
  );
}

/** Acknowledgement / resolution timelines from settings (never hardcoded in copy). */
export function GrievanceTimelines({ ackHours, resolutionDays }: { ackHours: number; resolutionDays: number }) {
  const ack = formatHours(ackHours);
  const resolve = Number.isFinite(resolutionDays) && resolutionDays > 0 ? `${resolutionDays} ${resolutionDays === 1 ? "day" : "days"}` : "";
  return (
    <section aria-labelledby="grievance-timelines-title" className="rounded-xl border border-border/80 bg-card p-6" data-testid="grievance-timelines">
      <h2 id="grievance-timelines-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
        <Clock className="size-5 text-teal" aria-hidden="true" />
        Our timelines
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Acknowledgement</dt>
          <dd className="font-semibold text-foreground">{ack ? `Within ${ack}` : "As soon as possible"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Resolution</dt>
          <dd className="font-semibold text-foreground">{resolve ? `Within ${resolve}` : "Within the period required by law"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Requests to remove content that impersonates someone or shows intimate images, and other urgent complaints, are acted on faster, as the law requires.
      </p>
    </section>
  );
}
