"use client";

import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";
import { formatFileSize } from "@/lib/format";
import {
  CV_IMPORT_ACCEPT,
  CV_IMPORT_CHECK_PATH,
  CV_IMPORT_CONSENT_LABEL,
  CV_IMPORT_RUN_PATH,
  CV_IMPORT_TEMPLATE_PATH,
  type CvImportPreview,
  type CvImportResult,
} from "@/modules/operations/cv-import-schemas";

import { ImportRows } from "./import-rows";

const BIG_BUTTON = "min-h-12 w-full px-5 text-base sm:w-auto";

async function post<T>(url: string, body: FormData): Promise<ActionResult<T>> {
  try {
    const response = await fetch(url, { method: "POST", body, headers: { Accept: "application/json" } });
    const result = (await response.json().catch(() => null)) as ActionResult<T> | null;
    if (result) return result;
    return { ok: false, error: response.status === 413 ? "The file is larger than 4 MB. Split it into smaller files." : "Something went wrong. Please try again." };
  } catch {
    // Also what a browser does when the chosen file was edited and saved after it was chosen.
    return { ok: false, error: "We could not send the file. If you changed it in Excel, choose it again. Otherwise check your internet connection and try again." };
  }
}

const n = (value: number) => value.toLocaleString("en-IN");
const people = (value: number) => `${n(value)} ${value === 1 ? "person" : "people"}`;

/** The four steps on one page: template, choose file + check, review + confirm + import, summary. */
export function ImportWizard({ maxBytes, maxRows }: { maxBytes: number; maxRows: number }) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CvImportPreview | null>(null);
  const [result, setResult] = useState<CvImportResult | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const maxMb = Math.floor(maxBytes / (1024 * 1024));

  useEffect(() => {
    if (preview && !result) reviewHeading.current?.focus();
  }, [preview, result]);
  useEffect(() => {
    if (result) doneHeading.current?.focus();
  }, [result]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setConsent(false);
    setConsentError(false);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const check = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setPreview(null);
    setResult(null);
    if (!file) {
      setError("Choose your Excel file first.");
      fileInput.current?.focus();
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      setError(/\.xls$/i.test(file.name) ? "This is an old Excel file (.xls). Open it in Excel, choose Save As, pick Excel Workbook (.xlsx), then choose the new file." : "Choose an Excel Workbook (.xlsx), for example our template.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`The file is larger than ${maxMb} MB. Split it into smaller files of up to ${n(maxRows)} people.`);
      return;
    }
    setBusy("check");
    const body = new FormData();
    body.set("file", file, file.name);
    const response = await post<CvImportPreview>(CV_IMPORT_CHECK_PATH, body);
    setBusy(null);
    if (!response.ok) setError(response.error);
    else if (response.data) {
      setPreview(response.data);
      setConsent(false);
      setConsentError(false);
    }
  };

  const runImport = async () => {
    if (busy || !preview || !file) return;
    if (!consent) {
      setConsentError(true);
      document.getElementById(`${id}-consent`)?.focus();
      return;
    }
    setBusy("import");
    setError(null);
    const body = new FormData();
    body.set("file", file, file.name);
    body.set("consent", "true");
    body.set("fileHash", preview.fileHash);
    const response = await post<CvImportResult>(CV_IMPORT_RUN_PATH, body);
    setBusy(null);
    if (!response.ok) setError(response.error);
    else if (response.data) setResult(response.data);
  };

  const errorBox = error ? (
    <p role="alert" className="rounded-lg border border-destructive/40 bg-danger-soft p-3 text-sm text-danger-strong">
      {error}
    </p>
  ) : null;

  if (result) {
    const skippedParts = [
      result.counts.exists ? `${n(result.counts.exists)} already in the CV list` : null,
      result.counts.duplicate ? `${n(result.counts.duplicate)} repeated in the file` : null,
      result.counts.problem ? `${n(result.counts.problem)} need fixing` : null,
    ].filter(Boolean);
    return (
      <SectionCard>
        <div className="space-y-4" data-testid="cv-import-done">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 size-6 shrink-0 text-success-strong" aria-hidden="true" />
            <div>
              <h2 ref={doneHeading} tabIndex={-1} className="font-heading text-xl font-semibold text-foreground outline-none">
                {result.created ? `${people(result.created)} added` : "Nobody was added"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                From {result.fileName}.{" "}
                {result.skipped ? `${n(result.skipped)} ${result.skipped === 1 ? "row was" : "rows were"} skipped: ${skippedParts.join(", ")}.` : "No rows were skipped."}
              </p>
              {result.counts.problem ? <p className="mt-1 text-sm text-muted-foreground">Fix those rows in Excel and upload the same file again: people already added are skipped.</p> : null}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className={BIG_BUTTON}>
              <Link href={result.listHref}>See imported CVs</Link>
            </Button>
            <Button type="button" variant="outline" className={BIG_BUTTON} onClick={reset}>
              Import another file
            </Button>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title="1. Download the template" description={`One person per row. Name, phone and trade are needed; the rest is optional. Up to ${n(maxRows)} people per file.`}>
        <div className="space-y-3">
          <Button asChild variant="outline" className={BIG_BUTTON}>
            <a href={CV_IMPORT_TEMPLATE_PATH} rel="nofollow" data-testid="cv-import-template">
              <FileSpreadsheet aria-hidden="true" />
              Download template
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">Already have a list? A CV list downloaded from this site (Download Excel) works too, and so does your own sheet if it has Name, Phone and Trade columns.</p>
        </div>
      </SectionCard>

      <SectionCard title="2. Choose your Excel file" description={`An Excel Workbook (.xlsx), up to ${maxMb} MB.`}>
        <form onSubmit={check} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-file`} className="text-sm font-medium text-foreground">
              Excel file
            </label>
            <input
              ref={fileInput}
              id={`${id}-file`}
              name="file"
              type="file"
              accept={CV_IMPORT_ACCEPT}
              disabled={busy !== null}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              className="block w-full rounded-lg border border-input bg-white p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-navy file:px-4 file:font-medium file:text-white"
            />
            {file ? (
              <p className="text-sm break-all text-muted-foreground">
                {file.name} · {formatFileSize(file.size)}
              </p>
            ) : null}
          </div>
          {!preview ? errorBox : null}
          <Button type="submit" aria-disabled={busy !== null || undefined} className={BIG_BUTTON} data-testid="cv-import-check">
            {busy === "check" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {busy === "check" ? "Checking…" : "Check file"}
          </Button>
        </form>
      </SectionCard>

      {preview ? (
        <section aria-labelledby={`${id}-review`} className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5" data-testid="cv-import-review">
          <div>
            <h2 id={`${id}-review`} ref={reviewHeading} tabIndex={-1} className="font-heading text-lg font-semibold text-foreground outline-none">
              3. Check and import
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {people(preview.totalRows)} found in {preview.fileName} (sheet “{preview.sheetName}”, names from row {preview.headerRow + 1}).
            </p>
          </div>

          {preview.otherSheets.length ? (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong" data-testid="cv-import-other-sheets">
              Only the sheet “{preview.sheetName}” is read. This file has more lists of people: {preview.otherSheets.map((s) => `“${s}”`).join(", ")}. Put everyone on one sheet,
              or save each sheet as its own file and import them one by one.
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-success/40 bg-success-soft p-3">
              <dt className="text-sm text-success-strong">Ready to add</dt>
              <dd className="font-heading text-2xl font-semibold tabular-nums text-foreground">{n(preview.counts.ready)}</dd>
            </div>
            <div className="rounded-xl border border-border bg-surface-subtle p-3">
              <dt className="text-sm text-muted-foreground">Will be skipped</dt>
              <dd className="font-heading text-2xl font-semibold tabular-nums text-foreground">{n(preview.totalRows - preview.counts.ready)}</dd>
            </div>
          </dl>

          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium text-foreground">Columns read:</span> <span className="text-muted-foreground">{preview.columnsUsed.map((c) => c.header).join(", ")}</span>
            </p>
            {preview.columnsNotUsed.length ? (
              <p>
                <span className="font-medium text-foreground">Not used:</span> <span className="text-muted-foreground">{preview.columnsNotUsed.join(", ")}</span>
              </p>
            ) : null}
            {!preview.passportsCompared && preview.columnsUsed.some((c) => c.field === "passportNumber") ? (
              <p className="text-muted-foreground">Passport numbers are not compared with the CV list, because you cannot see passport numbers. People are matched by phone.</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <ImportRows
              title="Need fixing"
              description="These rows are skipped. Fix them in Excel, save, then choose the file again: people already added are skipped next time."
              rows={preview.rows.problem}
              total={preview.counts.problem}
              reasonTone="danger"
              defaultOpen
              testId="cv-import-problems"
            />
            <ImportRows
              title="Already in the CV list"
              description={preview.passportsCompared ? "Same phone or passport number as a CV we have. Skipped." : "Same phone as a CV we have. Skipped."}
              rows={preview.rows.exists}
              total={preview.counts.exists}
              reasonTone="neutral"
            />
            <ImportRows title="Repeated in this file" description="The same person is higher up in the file. Only the first row is added." rows={preview.rows.duplicate} total={preview.counts.duplicate} reasonTone="neutral" />
            <ImportRows
              title="Ready to add"
              description={preview.withNotes ? `${people(preview.withNotes)} will be added with a note (something left blank or kept as typed).` : undefined}
              rows={preview.rows.ready}
              total={preview.counts.ready}
              reasonTone="neutral"
              testId="cv-import-ready"
            />
          </div>

          {preview.counts.ready ? (
            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <label htmlFor={`${id}-consent`} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-base text-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
                  <input
                    id={`${id}-consent`}
                    type="checkbox"
                    checked={consent}
                    aria-invalid={consentError || undefined}
                    aria-describedby={consentError ? `${id}-consent-error` : undefined}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      if (e.target.checked) setConsentError(false);
                    }}
                    className="mt-1 size-5 shrink-0 accent-[var(--foreground)]"
                    data-testid="cv-import-consent"
                  />
                  <span>{CV_IMPORT_CONSENT_LABEL}</span>
                </label>
                {consentError ? (
                  <p id={`${id}-consent-error`} className="mt-1 text-sm text-danger-strong">
                    Tick this box to import. Only add people who agreed that we contact them.
                  </p>
                ) : null}
              </div>
              {errorBox}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={runImport} aria-disabled={busy !== null || undefined} className={BIG_BUTTON} data-testid="cv-import-run">
                  {busy === "import" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  {busy === "import" ? "Importing…" : `Import ${people(preview.counts.ready)}`}
                </Button>
                <Button type="button" variant="outline" className={BIG_BUTTON} onClick={reset} disabled={busy !== null}>
                  Choose a different file
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">Nothing to import from this file. Fix the rows above in Excel, save, and choose the file again.</p>
              {errorBox}
              <Button type="button" variant="outline" className={BIG_BUTTON} onClick={reset}>
                Choose a different file
              </Button>
            </div>
          )}
          <p aria-live="polite" className="sr-only">
            {busy === "import" ? "Importing" : ""}
          </p>
        </section>
      ) : null}
    </div>
  );
}
