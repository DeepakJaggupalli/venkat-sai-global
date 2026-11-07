import { Briefcase, ClipboardCheck, FileText, Send, Users } from "lucide-react";

import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { CardsSkeleton, TableSkeleton } from "@/components/shared/loading-state";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { STATUS_PRESETS, type StatusDomain } from "@/components/shared/status-presets";
import { Stepper } from "@/components/shared/stepper";
import { Timeline } from "@/components/shared/timeline";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { VERIFICATION_STATES } from "@/components/shared/verification";

import { DemoLabel, ShowcaseSection } from "../_components/showcase-section";

const DOMAINS: { domain: StatusDomain; label: string }[] = [
  { domain: "verification", label: "Verification" },
  { domain: "job", label: "Jobs" },
  { domain: "application", label: "Applications" },
  { domain: "applicationStage", label: "Pipeline stages" },
  { domain: "payment", label: "Payments" },
  { domain: "invoice", label: "Invoices" },
  { domain: "ticket", label: "Support tickets" },
  { domain: "approval", label: "Approvals" },
];

// Fixed sample timestamps so the page renders identically on every load.
const T0 = new Date("2026-11-01T09:30:00.000Z");
const hoursAfter = (h: number) => new Date(T0.getTime() + h * 3_600_000);

export function FoundationsSections() {
  return (
    <>
      <ShowcaseSection id="badges" title="Status badges" description="Domain presets map raw statuses to a tone and a label. The label always names the state.">
        {DOMAINS.map(({ domain, label }) => (
          <div key={domain}>
            <DemoLabel>{label}</DemoLabel>
            <div className="flex flex-wrap gap-2">
              {Object.keys(STATUS_PRESETS[domain]).map((status) => (
                <StatusBadge key={status} status={status} domain={domain} />
              ))}
            </div>
          </div>
        ))}
        <div>
          <DemoLabel>Custom tones</DemoLabel>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="brand">Sample brand</StatusBadge>
            <StatusBadge tone="gold" icon={<Briefcase />}>
              Sample featured
            </StatusBadge>
            <StatusBadge tone="neutral" size="sm">
              Small
            </StatusBadge>
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="verification" title="Verification badges" description="Verified, employer-supplied, self-declared, pending and unverified information are always distinguishable.">
        <div className="flex flex-wrap gap-2">
          {VERIFICATION_STATES.map((state) => (
            <VerificationBadge key={state} state={state} verifiedAt={state === "verified" ? T0 : null} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {VERIFICATION_STATES.map((state) => (
            <VerificationBadge key={state} state={state} variant="inline" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <VerificationBadge state="employer_supplied" variant="detail" />
          <VerificationBadge state="verified" verifiedAt={T0} variant="detail" />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="stats" title="Stat cards" description="Values only come from props. These figures are sample data.">
        <StatGrid>
          <StatCard label="Sample open jobs" value={12} icon={<Briefcase />} delta={{ value: 0.2, period: "vs sample last month" }} href="/dev/ui#stats" />
          <StatCard label="Sample applications" value={18_450} icon={<Send />} delta={{ value: -0.034, period: "vs sample last week" }} hint="Sample definition text" />
          <StatCard label="Sample time to shortlist" value={4.5} unit="days" icon={<ClipboardCheck />} delta={{ value: -1, format: "number", period: "vs sample average", goodDirection: "down" }} />
          <StatCard label="Sample metric with no data" value={null} icon={<Users />} hint="Honest empty value" />
        </StatGrid>
      </ShowcaseSection>

      <ShowcaseSection id="key-values" title="Key-value list">
        <KeyValueList
          columns={2}
          items={[
            { label: "Code", value: "JOB-SAMPLE-0001" },
            { label: "Employer", value: "Example Co." },
            { label: "Location", value: "Sample City" },
            { label: "Start date", value: null, hint: "Empty values show an honest placeholder" },
            { label: "Description", value: "A longer sample value that spans the full width of the list.", fullWidth: true },
          ]}
        />
      </ShowcaseSection>

      <ShowcaseSection id="callouts" title="Callouts">
        <Callout tone="info" title="Sample information">Verified documents are visible to employers you apply to.</Callout>
        <Callout tone="success" title="Sample success">Your sample profile was saved.</Callout>
        <Callout tone="warning" title="Sample warning" action={{ label: "Complete verification", href: "/dev/ui#callouts" }}>
          Jobs can be published once the organisation is verified.
        </Callout>
        <Callout tone="danger" title="Sample error">The sample document could not be scanned. Upload it again.</Callout>
      </ShowcaseSection>

      <ShowcaseSection id="empty" title="Empty states">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState icon={<Briefcase />} title="No jobs yet" description="Jobs you post will appear here." primaryAction={{ label: "Post a job", href: "/dev/ui#empty" }} secondaryAction={{ label: "Learn more", href: "/dev/ui#empty" }} />
          <EmptyState icon={<FileText />} size="sm" variant="plain" title="No documents" description="Upload your passport or certificates to get verified." />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="loading" title="Loading skeletons" description="Presets for loading.tsx files: page, table, cards and detail.">
        <TableSkeleton rows={3} label="Loading sample table" />
        <CardsSkeleton count={3} label="Loading sample cards" />
      </ShowcaseSection>

      <ShowcaseSection id="timeline" title="Timeline">
        <Timeline
          label="Sample application history"
          timeFormat="absolute"
          timeZone="Asia/Kolkata"
          items={[
            { id: "t3", title: "Moved to Interview", at: hoursAfter(50), actor: { name: "Sample Recruiter", role: "Example Co." }, icon: <Users />, tone: "brand", note: "Sample note: trade test scheduled." },
            { id: "t2", title: "Shortlisted", at: hoursAfter(26), actor: { name: "Sample Staff Member", role: "Venkat Sai staff" }, tone: "info" },
            { id: "t1", title: "Application submitted", at: T0, actor: { name: "Sample Candidate A" } },
          ]}
        />
      </ShowcaseSection>

      <ShowcaseSection id="stepper" title="Stepper" description="Collapses to “Step 2 of 4” on phones.">
        <Stepper
          label="Sample application steps"
          current="documents"
          steps={[
            { id: "details", label: "Details", description: "Basic information", href: "/dev/ui#stepper" },
            { id: "documents", label: "Documents", description: "Passport, certificates" },
            { id: "screening", label: "Screening", description: "Questions" },
            { id: "review", label: "Review", description: "Check and submit" },
          ]}
        />
        <div className="max-w-sm">
          <Stepper
            orientation="vertical"
            label="Sample onboarding"
            current={1}
            steps={[
              { id: "org", label: "Organisation details" },
              { id: "docs", label: "Verification documents" },
              { id: "team", label: "Invite your team" },
            ]}
          />
        </div>
      </ShowcaseSection>
    </>
  );
}
