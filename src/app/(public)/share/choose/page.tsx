import { ArrowRight, Briefcase, FileUp, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { InstallAppButton } from "@/components/public/install-app-button";
import { PageHero } from "@/components/public/page-hero";
import { buildPageMetadata } from "@/components/public/server";
import { loadSharedFile } from "@/components/public/shared-file";
import { SharedFileCard } from "@/components/public/shared-file-card";
import { sp as pick, type SearchParams } from "@/lib/http";

export const metadata: Metadata = buildPageMetadata({
  title: "Share a file with us",
  description: "Send a photo or document from your phone to Venkat Sai Global: your CV, or a job requirement if you are hiring.",
  path: "/share/choose",
  noindex: true,
});

const ERRORS: Record<string, string> = {
  size: "This file is larger than 4 MB. Choose a smaller file, or take a screenshot or photo of it.",
  type: "We can only accept photos (JPG, PNG or WebP), PDF and Word files.",
  rate_limited: "You have shared several files in a short time. Please wait a little and try again.",
  origin: "Please share the file from our website or app.",
  read: "The file could not be read. Please try again.",
  store: "Something went wrong while receiving the file. Please try again, or send it on WhatsApp.",
};

const FILE_ACCEPT = "image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const CHOICE =
  "group flex min-h-24 items-center gap-4 rounded-2xl border border-border bg-white p-5 text-left shadow-sm transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Choice({ href, icon, title, text, testId }: { href: string; icon: ReactNode; title: string; text: string; testId: string }) {
  return (
    <Link href={href} prefetch={false} className={CHOICE} data-testid={testId}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-strong">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-lg font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{text}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * Where a share lands (POST /share → ?t=<token>): the shared file and two big choices. Opened directly (no token,
 * or an expired one) it offers a normal file picker that posts to /share, plus the same two choices.
 */
export default async function ShareChoosePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { file, expired } = await loadSharedFile(pick(sp, "t"));
  const error = pick(sp, "error");
  const message = error ? (ERRORS[error] ?? ERRORS.store) : expired ? "This shared file has expired or was already used. Please choose it again." : null;
  const q = file ? `?shared=${encodeURIComponent(file.token)}` : "";

  return (
    <>
      <PageHero
        eyebrow="Share with us"
        title={file ? "What is this file for?" : "Send us a photo or document"}
        intro={file ? "Choose one. You can check everything before sending." : "Pick a photo or document from your phone, then tell us what it is for."}
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Share" }]}
      />
      <div className="container-page max-w-2xl space-y-6 py-10 sm:py-14">
        {message ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-danger-soft p-4 text-sm text-danger-strong" data-testid="share-error">
            {message}
          </p>
        ) : null}

        {file ? (
          <SharedFileCard file={file} />
        ) : (
          <form action="/share" method="post" encType="multipart/form-data" className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6" data-testid="share-picker">
            <label htmlFor="share-file" className="block text-base font-semibold text-foreground">
              Photo or document
            </label>
            <input
              id="share-file"
              name="file"
              type="file"
              required
              accept={FILE_ACCEPT}
              aria-describedby="share-file-hint"
              className="block w-full rounded-xl border-2 border-dashed border-border bg-surface-subtle p-4 text-base file:mr-4 file:inline-flex file:min-h-11 file:rounded-full file:border-0 file:bg-foreground file:px-4 file:text-sm file:font-semibold file:text-white"
            />
            <p id="share-file-hint" className="text-sm text-muted-foreground">
              JPG, PNG, WebP, PDF or Word, up to 4 MB. On a phone this opens your gallery or files.
            </p>
            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-base font-semibold text-white hover:bg-[#26262b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
            >
              <FileUp className="size-5" aria-hidden="true" />
              Continue
            </button>
          </form>
        )}

        <div className="space-y-3">
          {!file ? <h2 className="font-heading text-lg font-bold text-foreground">Or go straight to</h2> : null}
          <Choice
            href={`/send-cv${q}`}
            icon={<UserRound className="size-6" aria-hidden="true" />}
            title="Send as my CV"
            text="For jobs abroad. Our team will call you."
            testId="share-choice-cv"
          />
          <Choice
            href={`/requirements/submit${q}`}
            icon={<Briefcase className="size-6" aria-hidden="true" />}
            title="Post a job requirement (I'm hiring)"
            text="We check it and call you before it goes on our website."
            testId="share-choice-requirement"
          />
        </div>

        <InstallAppButton />
        <p className="text-sm text-muted-foreground">
          Venkat Sai staff: sign in first, then share the poster again to publish it directly.{" "}
          <Link href="/sign-in?returnTo=%2Fshare%2Fchoose" className="font-medium text-teal-strong underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
