"use client";

import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { shrinkImageIfNeeded } from "@/components/documents/shrink-image";
import { ConsentCheckbox, Honeypot } from "@/components/public/forms/form-parts";
import { FormErrorAlert, FormField } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";
import { MARITAL_STATUS_OPTIONS, RESUME_PHOTO_ACCEPT, RESUME_PHOTO_MAX_BYTES, type ResumeDetails, type ResumeRequestResult } from "@/modules/resume-service/schemas";

import { EMPTY_EXPERIENCE, ExperienceRowsEditor, type ExperienceDraft } from "./experience-rows";
import { ResumeConfirmation } from "./resume-confirmation";

const INPUT = "h-12 text-base";
const SELECT =
  "h-12 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

function toDrafts(rows: ResumeDetails["abroadExperience"] | undefined): ExperienceDraft[] {
  return (rows ?? []).map((r) => ({ organisation: r.organisation, location: r.location ?? "", from: r.from, to: r.to ?? "", current: r.current, designation: r.designation }));
}

/** Rows the candidate left completely empty are dropped (so an unused "Job 1" never blocks the form). */
function filledDrafts(rows: ExperienceDraft[]): ExperienceDraft[] {
  return rows.filter((r) => r.organisation.trim() || r.location.trim() || r.from || r.to || r.designation.trim());
}

function fromDrafts(rows: ExperienceDraft[]) {
  return rows.map((r) => ({ organisation: r.organisation, location: r.location, from: r.from, to: r.current ? "" : r.to, current: r.current, designation: r.designation }));
}

type Props = { mode: "public" } | { mode: "staff"; initial: ResumeDetails | null; requestId: string; staffAction: (input: { id: string; details: string }) => Promise<ActionResult<unknown>> };

/**
 * "Prepare my resume" form. Fields mirror the business's resume layout (label : value block, passport table,
 * experience abroad and in India). Public mode posts to /resume-service/submit with an optional photo (shrunk in the
 * browser); staff mode saves corrected details through a Server Action.
 */
export function ResumeForm(props: Props) {
  const router = useRouter();
  const initial = props.mode === "staff" ? props.initial : null;
  const [state, setState] = useState<ActionState<ResumeRequestResult>>(null);
  const [pending, start] = useTransition();
  const [abroad, setAbroad] = useState<ExperienceDraft[]>(initial ? toDrafts(initial.abroadExperience) : [{ ...EMPTY_EXPERIENCE }]);
  const [india, setIndia] = useState<ExperienceDraft[]>(initial ? toDrafts(initial.indiaExperience) : []);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  if (props.mode === "public" && state?.ok && state.data) return <ResumeConfirmation result={state.data} />;

  const errors = (path: string) => (state && !state.ok ? state.fieldErrors?.[`details.${path}`] : undefined);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? "").trim();
    // Keep the shown rows in step with what is sent, so error positions match the rows on screen.
    const abroadRows = filledDrafts(abroad);
    const indiaRows = filledDrafts(india);
    setAbroad(abroadRows);
    setIndia(indiaRows);
    const details = {
      postAppliedFor: get("postAppliedFor"),
      name: get("name"),
      fatherName: get("fatherName"),
      dateOfBirth: get("dateOfBirth"),
      maritalStatus: get("maritalStatus"),
      educationQualification: get("educationQualification"),
      technicalQualification: get("technicalQualification"),
      nationality: get("nationality"),
      religion: get("religion"),
      languages: get("languages"),
      permanentAddress: String(form.get("permanentAddress") ?? "").trim(),
      contactPhone: get("contactPhone"),
      alternatePhone: get("alternatePhone"),
      email: get("email"),
      passport: { number: get("passport.number"), dateOfIssue: get("passport.dateOfIssue"), dateOfExpiry: get("passport.dateOfExpiry"), placeOfIssue: get("passport.placeOfIssue") },
      abroadExperience: fromDrafts(abroadRows),
      indiaExperience: fromDrafts(indiaRows),
      declaration: { include: form.get("declaration.include") === "on", place: get("declaration.place") },
    };
    start(async () => {
      if (props.mode === "staff") {
        const result = await props.staffAction({ id: props.requestId, details: JSON.stringify(details) });
        setState(result.ok ? null : { ok: false, error: result.error, fieldErrors: result.fieldErrors });
        if (result.ok) {
          toast.success(result.message ?? "Details saved.");
          router.refresh();
        }
        return;
      }
      const body = new FormData();
      body.set("details", JSON.stringify(details));
      body.set("candidateNotes", get("candidateNotes"));
      if (form.get("consentToContact")) body.set("consentToContact", "true");
      body.set("website", get("website"));
      try {
        if (photo) {
          const prepared = await shrinkImageIfNeeded(photo, { maxBytes: 1_500_000, maxSide: 1200 });
          if (prepared.size > RESUME_PHOTO_MAX_BYTES) {
            setPhotoError("The photo is larger than 4 MB. Choose a smaller photo.");
            return;
          }
          body.set("photo", prepared, prepared.name);
        }
        const response = await fetch("/resume-service/submit", { method: "POST", body, headers: { Accept: "application/json" } });
        const result = (await response.json().catch(() => null)) as ActionResult<ResumeRequestResult> | null;
        setState(result ?? { ok: false, error: "Something went wrong. Please try again, or message us on WhatsApp." });
      } catch {
        setState({ ok: false, error: "We could not reach our server. Check your internet connection and try again." });
      }
    });
  };

  const photoErrors = photoError ? [photoError] : state && !state.ok ? state.fieldErrors?.photo : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-6 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8" data-testid="resume-form">
      <FormErrorAlert state={state} />
      {props.mode === "public" ? <Honeypot /> : null}

      <fieldset className="space-y-5">
        <legend className="font-heading text-lg font-semibold text-navy">Personal details</legend>
        <FormField label="Post applied for" name="postAppliedFor" required errors={errors("postAppliedFor")} hint="For example: TIG Welder, Pipe Fitter, Electrician">
          <Input maxLength={120} defaultValue={initial?.postAppliedFor} className={INPUT} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Full name (as in passport)" name="name" required errors={errors("name")}>
            <Input autoComplete="name" maxLength={120} defaultValue={initial?.name} className={INPUT} />
          </FormField>
          <FormField label="Father's name" name="fatherName" optional errors={errors("fatherName")}>
            <Input maxLength={120} defaultValue={initial?.fatherName} className={INPUT} />
          </FormField>
          <FormField label="Date of birth" name="dateOfBirth" optional errors={errors("dateOfBirth")}>
            <Input type="date" defaultValue={initial?.dateOfBirth} className={INPUT} />
          </FormField>
          <FormField label="Marital status" name="maritalStatus" optional errors={errors("maritalStatus")}>
            <select className={SELECT} defaultValue={initial?.maritalStatus ?? ""}>
              <option value="">Choose</option>
              {MARITAL_STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Education qualification" name="educationQualification" optional errors={errors("educationQualification")} hint="For example: SSC, Intermediate">
            <Input maxLength={200} defaultValue={initial?.educationQualification} className={INPUT} />
          </FormField>
          <FormField label="Technical qualification" name="technicalQualification" optional errors={errors("technicalQualification")} hint="For example: ITI Welder, 6G TIG certified">
            <Input maxLength={300} defaultValue={initial?.technicalQualification} className={INPUT} />
          </FormField>
          <FormField label="Nationality" name="nationality" optional errors={errors("nationality")}>
            <Input maxLength={60} defaultValue={initial?.nationality} className={INPUT} />
          </FormField>
          <FormField label="Religion" name="religion" optional errors={errors("religion")} hint="Leave empty to keep it off the resume.">
            <Input maxLength={60} defaultValue={initial?.religion} className={INPUT} />
          </FormField>
          <FormField label="Languages known" name="languages" optional errors={errors("languages")} hint="For example: English, Hindi, Telugu">
            <Input maxLength={200} defaultValue={initial?.languages} className={INPUT} />
          </FormField>
        </div>
        <FormField label="Permanent address" name="permanentAddress" optional errors={errors("permanentAddress")}>
          <Textarea rows={3} maxLength={500} defaultValue={initial?.permanentAddress} className="text-base" />
        </FormField>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-heading text-lg font-semibold text-navy">Contact</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Mobile / WhatsApp number" name="contactPhone" required errors={errors("contactPhone")} hint="Printed with the country code, for example +91.">
            <Input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} defaultValue={initial?.contactPhone} placeholder="98765 43210" className={INPUT} />
          </FormField>
          <FormField label="Another number" name="alternatePhone" optional errors={errors("alternatePhone")}>
            <Input type="tel" inputMode="tel" maxLength={20} defaultValue={initial?.alternatePhone} className={INPUT} />
          </FormField>
          <FormField label="Email" name="email" optional errors={errors("email")}>
            <Input type="email" autoComplete="email" maxLength={200} defaultValue={initial?.email} className={INPUT} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-heading text-lg font-semibold text-navy">Passport details</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Passport number" name="passport.number" optional errors={errors("passport.number")}>
            <Input autoCapitalize="characters" spellCheck={false} maxLength={14} defaultValue={initial?.passport.number} className={`${INPUT} uppercase`} />
          </FormField>
          <FormField label="Place of issue" name="passport.placeOfIssue" optional errors={errors("passport.placeOfIssue")}>
            <Input maxLength={80} defaultValue={initial?.passport.placeOfIssue} className={INPUT} />
          </FormField>
          <FormField label="Date of issue" name="passport.dateOfIssue" optional errors={errors("passport.dateOfIssue")}>
            <Input type="date" defaultValue={initial?.passport.dateOfIssue} className={INPUT} />
          </FormField>
          <FormField label="Date of expiry" name="passport.dateOfExpiry" optional errors={errors("passport.dateOfExpiry")}>
            <Input type="date" defaultValue={initial?.passport.dateOfExpiry} className={INPUT} />
          </FormField>
        </div>
      </fieldset>

      <ExperienceRowsEditor legend="Experience abroad" description="Jobs outside India, newest first." rows={abroad} onChange={setAbroad} errorsFor={(p) => errors(`abroadExperience.${p}`)} totalStyle="title" />
      <ExperienceRowsEditor legend="Experience in India" description="Jobs in India, newest first." rows={india} onChange={setIndia} errorsFor={(p) => errors(`indiaExperience.${p}`)} totalStyle="upper" />

      <fieldset className="space-y-3">
        <legend className="font-heading text-lg font-semibold text-navy">Declaration</legend>
        <label className="flex items-start gap-3 text-base text-foreground">
          <input type="checkbox" name="declaration.include" defaultChecked={initial ? initial.declaration.include : true} className="mt-1 size-5" />
          Add the declaration with place, date and signature line at the end
        </label>
        <FormField label="Place" name="declaration.place" optional errors={errors("declaration.place")} hint="Usually your town or city.">
          <Input maxLength={80} defaultValue={initial?.declaration.place} className={INPUT} />
        </FormField>
      </fieldset>

      {props.mode === "public" ? (
        <>
          <FormField label="Passport-size photo" name="photo" optional errors={photoErrors} hint="A recent photo on a plain white background (JPG or PNG). Printed at the top right of your resume.">
            {(control) => (
              <div className="space-y-2">
                <label htmlFor={control.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-navy/30 bg-surface-subtle px-4 py-3 text-base font-semibold text-navy hover:border-navy/60 focus-within:ring-3 focus-within:ring-ring/50">
                  <Camera className="size-6 shrink-0" aria-hidden="true" />
                  <span>{photo ? `Chosen: ${photo.name}` : "Choose your photo"}</span>
                </label>
                <input
                  {...control}
                  type="file"
                  accept={RESUME_PHOTO_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    setPhoto(e.target.files?.[0] ?? null);
                    setPhotoError(null);
                  }}
                />
              </div>
            )}
          </FormField>
          <FormField label="Notes for us" name="candidateNotes" optional hint="Anything else for your resume: skills, certificates, gaps you want explained.">
            <Textarea rows={3} maxLength={1000} className="text-base" />
          </FormField>
          <ConsentCheckbox state={state} label="I agree that Venkat Sai Global may call or WhatsApp me about this resume request and keep these details to prepare my resume." />
        </>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-navy px-6 text-base font-semibold text-white hover:bg-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70 sm:w-auto"
        data-testid="resume-submit"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
        {props.mode === "staff" ? (pending ? "Saving..." : "Save details") : pending ? "Sending..." : "Send my details"}
      </button>
    </form>
  );
}
