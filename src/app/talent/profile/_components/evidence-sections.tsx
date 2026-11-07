import { AlertTriangle, Award, FileStack, Images, Lock, Globe } from "lucide-react";

import { FileLink, FilePreview } from "@/components/files";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeleteItemButton, DocumentSharingToggle, EditDialog, SubmitVerificationButton } from "@/components/talent/profile/dialog";
import { CredentialForm, DocumentForm, PortfolioForm } from "@/components/talent/profile/evidence-forms";
import { toVideoEmbed } from "@/components/talent/profile/video";
import { PLATFORM_ISSUED_CREDENTIAL_ISSUERS } from "@/modules/candidates/constants";

import {
  deleteCredential,
  deleteDocument,
  deletePortfolioItem,
  saveCredential,
  saveDocument,
  savePortfolioItem,
  setDocumentSharing,
  submitCredentialVerification,
  submitDocumentVerification,
} from "../actions";
import type { SectionProps } from "../_lib/options";
import { dateText, ItemStatus } from "./bits";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Credentials (issuer-type labels), portfolio (YouTube/Vimeo embeds only) and typed documents. */
export function EvidenceSections({ t, loc, detail, options, credentialLinks }: SectionProps & { credentialLinks: Map<string, string[]> }) {
  const skillOptions = detail.skills.filter((s) => s.source !== "assessment").map((s) => ({ value: s.skillId, label: s.name }));
  const today = todayIso();

  return (
    <>
      <SectionCard
        id="credentials"
        title={t("section.credentials")}
        description={t("section.credentials.description")}
        headingLevel="h2"
        action={
          <EditDialog mode="add" triggerLabel={t("action.add")} srLabel={`${t("action.add")}: ${t("section.credentials")}`} title={t("credentials.add")}>
            <CredentialForm action={saveCredential} item={null} skills={skillOptions} linkedSkillIds={[]} />
          </EditDialog>
        }
      >
        {detail.credentials.length ? (
          <ul className="divide-y">
            {detail.credentials.map((c) => {
              const platformIssued = PLATFORM_ISSUED_CREDENTIAL_ISSUERS.includes(c.issuerType);
              const canSubmit = !platformIssued && c.file && (c.verificationStatus === "unverified" || c.verificationStatus === "rejected");
              return (
                <li key={c.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[t(`enum.credentialType.${c.credentialType}`), c.issuer, c.issuedAt ? t("field.issuedOn", { date: dateText(c.issuedAt, loc) ?? "" }) : null, c.expiresAt ? t("field.expiresOn", { date: dateText(c.expiresAt, loc) ?? "" }) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={c.issuerType === "self_declared" ? "neutral" : c.issuerType === "venkat_sai" ? "gold" : "info"} size="sm">
                        {t(`issuer.${c.issuerType}`)}
                      </StatusBadge>
                      <ItemStatus status={c.verificationStatus} reason={c.rejectionReason} t={t} />
                    </div>
                    {c.issuerType === "venkat_sai" ? <p className="text-xs text-muted-foreground">{t("issuer.venkat_sai.hint")}</p> : null}
                    {c.file ? <FileLink file={c.file} /> : !platformIssued ? <p className="text-xs text-muted-foreground">{t("credentials.uploadToVerify")}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canSubmit ? <SubmitVerificationButton action={submitCredentialVerification} id={c.id} itemLabel={c.name} /> : null}
                    {platformIssued ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock aria-hidden="true" className="size-3.5" />
                        {t("credentials.readOnly")}
                      </span>
                    ) : (
                      <>
                        <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${c.name}`} title={t("credentials.edit")}>
                          <CredentialForm action={saveCredential} item={c} skills={skillOptions} linkedSkillIds={credentialLinks.get(c.id) ?? []} />
                        </EditDialog>
                        <DeleteItemButton action={deleteCredential} id={c.id} itemLabel={c.name} />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState size="sm" icon={<Award aria-hidden="true" />} title={t("credentials.empty")} description={t("credentials.emptyDescription")} />
        )}
      </SectionCard>

      <SectionCard
        id="portfolio"
        title={t("section.portfolio")}
        description={t("section.portfolio.description")}
        headingLevel="h2"
        action={
          <EditDialog mode="add" triggerLabel={t("action.add")} srLabel={`${t("action.add")}: ${t("section.portfolio")}`} title={t("portfolio.add")}>
            <PortfolioForm action={savePortfolioItem} item={null} />
          </EditDialog>
        }
      >
        {detail.portfolio.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {detail.portfolio.map((item) => {
              const embed = toVideoEmbed(item.videoUrl);
              return (
                <li key={item.id} className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{[item.location, dateText(item.projectDate, loc)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <StatusBadge tone={item.isPublic ? "info" : "neutral"} size="sm" icon={item.isPublic ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}>
                      {item.isPublic ? t("portfolio.publicBadge") : t("portfolio.privateBadge")}
                    </StatusBadge>
                  </div>
                  {item.description ? <p className="line-clamp-4 whitespace-pre-line text-sm">{item.description}</p> : null}
                  {embed ? (
                    <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
                      <iframe
                        src={embed.embedUrl}
                        title={t("portfolio.videoTitle", { title: item.title })}
                        className="size-full"
                        loading="lazy"
                        allow="encrypted-media; picture-in-picture; fullscreen"
                        referrerPolicy="strict-origin-when-cross-origin"
                        sandbox="allow-scripts allow-same-origin allow-presentation"
                      />
                    </div>
                  ) : null}
                  {item.media.length ? (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t("field.media")}>
                      {item.media.map((file) => (
                        <li key={file.id}>
                          <a href={file.url} target="_blank" rel="noreferrer" className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
                            <FilePreview file={file} size="sm" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.tags.length ? <p className="text-xs text-muted-foreground">{item.tags.map((tag) => `#${tag}`).join(" ")}</p> : null}
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${item.title}`} title={t("portfolio.edit")}>
                      <PortfolioForm action={savePortfolioItem} item={item} />
                    </EditDialog>
                    <DeleteItemButton action={deletePortfolioItem} id={item.id} itemLabel={item.title} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState size="sm" icon={<Images aria-hidden="true" />} title={t("portfolio.empty")} description={t("portfolio.emptyDescription")} />
        )}
      </SectionCard>

      <SectionCard
        id="documents"
        title={t("section.documents")}
        description={t("section.documents.description")}
        headingLevel="h2"
        action={
          <EditDialog mode="add" triggerLabel={t("action.add")} srLabel={`${t("action.add")}: ${t("section.documents")}`} title={t("documents.add")}>
            <DocumentForm action={saveDocument} item={null} countries={options.countries} />
          </EditDialog>
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">{t("documents.never")}</p>
        {detail.documents.length ? (
          <ul className="divide-y">
            {detail.documents.map((d) => {
              const label = d.title || t(`enum.documentType.${d.documentType}`);
              const expired = d.expiresAt !== null && d.expiresAt < today;
              const canSubmit = d.file && (d.verificationStatus === "unverified" || d.verificationStatus === "rejected");
              return (
                <li key={d.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{label}</p>
                    <p className="text-sm text-muted-foreground">
                      {[d.title ? t(`enum.documentType.${d.documentType}`) : null, d.numberLast4 ? t("field.documentNumber.endsWith", { last4: d.numberLast4 }) : null, d.expiresAt ? t("field.expiresOn", { date: dateText(d.expiresAt, loc) ?? "" }) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {expired ? (
                      <p className="inline-flex items-center gap-1 text-sm font-medium text-warning-strong">
                        <AlertTriangle aria-hidden="true" className="size-4" />
                        {t("documents.expired")}
                      </p>
                    ) : null}
                    <ItemStatus status={d.verificationStatus} reason={d.rejectionReason} t={t} />
                    {d.file ? <FileLink file={d.file} download showMeta /> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <DocumentSharingToggle action={setDocumentSharing} id={d.id} shared={d.isShareableWithEmployers} itemLabel={label} />
                    {canSubmit ? <SubmitVerificationButton action={submitDocumentVerification} id={d.id} itemLabel={label} /> : null}
                    <EditDialog triggerLabel={t("action.edit")} srLabel={`${t("action.edit")}: ${label}`} title={t("documents.edit")}>
                      <DocumentForm action={saveDocument} item={d} countries={options.countries} />
                    </EditDialog>
                    <DeleteItemButton action={deleteDocument} id={d.id} itemLabel={label} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState size="sm" icon={<FileStack aria-hidden="true" />} title={t("documents.empty")} description={t("documents.emptyDescription")} />
        )}
      </SectionCard>
    </>
  );
}
