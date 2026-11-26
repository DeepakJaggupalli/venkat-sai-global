"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { WhatsAppIcon } from "@/components/public/contact-links";
import { CONTACT, whatsappHref } from "@/config/contact";
import { cn } from "@/lib/utils";

import { areaHomeForPath } from "./portal-home";

export type RouteErrorLabels = {
  title?: string;
  body?: string;
  retry?: string;
  home?: string;
  whatsapp?: string;
  /** "Reference: {code}" — `{code}` is replaced by the error digest. */
  reference?: string;
  /** Staff-only line telling them whom to tell. */
  staffHelp?: string;
};

export type RouteErrorProps = {
  /** What could not load, for the heading: "your jobs" → "We could not load your jobs". */
  area?: string;
  /** The error digest Next.js gives server errors: shown as a reference code, never the message or stack. */
  digest?: string;
  /** Next.js `retry` (re-fetches the segment). Preferred. */
  retry?: () => void;
  /** Next.js `reset` (re-renders without re-fetching). Used with a router refresh when `retry` is missing. */
  reset?: () => void;
  /** "Go to my dashboard" target. Defaults to the home of the portal in the current URL. */
  homeHref?: string;
  homeLabel?: string;
  /** "staff" (Command Centre) asks them to tell the owner; "external" offers WhatsApp. Defaults from the URL. */
  audience?: "staff" | "external";
  /** Translated wording (People Portal). */
  labels?: RouteErrorLabels;
  /** h1 when the error replaces a whole page (default); h2 inside a page that keeps its own heading. */
  headingLevel?: "h1" | "h2";
  className?: string;
};

/**
 * The one friendly error screen for every portal and the public site: a plain message, Try again,
 * Go to my dashboard, WhatsApp support (or "tell the owner" for staff) and the reference code. Never shows the
 * error message or a stack trace. Use it from every `error.tsx`:
 *
 *   export default function Error({ error, retry, reset }: ErrorBoundaryProps) {
 *     return <RouteError area="your jobs" digest={error.digest} retry={retry} reset={reset} />;
 *   }
 */
export function RouteError({ area, digest, retry, reset, homeHref, homeLabel, audience, labels = {}, headingLevel: Heading = "h1", className }: RouteErrorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const home = areaHomeForPath(pathname);
  const who = audience ?? home.audience;
  const code = digest && /^[\w-]{1,64}$/.test(digest) ? digest : null;

  useEffect(() => {
    // The digest only: messages from client errors could carry personal data.
    if (code) console.error(`Page error, reference ${code}`);
  }, [code]);

  function tryAgain() {
    if (retry) {
      startTransition(() => retry());
      return;
    }
    // Older boundaries only have reset(): refresh the server data first so a server error can recover.
    startTransition(() => {
      router.refresh();
      reset?.();
    });
  }

  const title = labels.title ?? (area ? `We could not load ${area}` : "Something went wrong");
  const body =
    labels.body ??
    (who === "staff"
      ? "This page hit a problem on our side. Nothing you saved is lost. Try again in a moment."
      : "This page hit a problem on our side. Nothing you saved is lost. Try again, and if it keeps happening, WhatsApp us and we will help.");
  const whatsappMessage = `Hello Venkat Sai, a page on the website is not working for me.${code ? ` Reference: ${code}` : ""}`;

  return (
    <div role="alert" data-slot="route-error" className={cn("mx-auto flex w-full max-w-xl flex-col items-center px-1 py-10 text-center sm:py-14", className)}>
      <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning-strong">
        <TriangleAlert className="size-7" />
      </span>
      <Heading className="mt-5 font-display text-[1.75rem] leading-tight text-balance text-foreground sm:text-[2.125rem]">{title}</Heading>
      <p className="mt-3 max-w-md text-[15px] text-pretty text-muted-foreground sm:text-base">{body}</p>
      {who === "staff" ? (
        <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground">{labels.staffHelp ?? "If it keeps happening, tell the owner and give them the reference code below."}</p>
      ) : null}

      <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
        <button
          type="button"
          onClick={tryAgain}
          disabled={pending}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-white transition-colors hover:bg-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
        >
          <RotateCcw aria-hidden="true" className={cn("size-4", pending && "motion-safe:animate-spin")} />
          {pending ? "Trying again…" : (labels.retry ?? "Try again")}
        </button>
        <Link
          href={homeHref ?? home.href}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {labels.home ?? homeLabel ?? home.label}
        </Link>
        {who === "external" ? (
          <a
            href={whatsappHref(whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <WhatsAppIcon className="size-[18px] text-green-strong" />
            {labels.whatsapp ?? "WhatsApp us"}
            <span className="sr-only"> (opens WhatsApp, {CONTACT.whatsapp.display})</span>
          </a>
        ) : null}
      </div>

      {code ? (
        <p className="mt-6 text-xs text-muted-foreground">
          {(labels.reference ?? "Reference code: {code}").split("{code}")[0]}
          <span className="rounded-md bg-surface-subtle px-1.5 py-0.5 font-mono text-[12px] text-foreground select-all" translate="no">
            {code}
          </span>
          {(labels.reference ?? "Reference code: {code}").split("{code}")[1] ?? ""}
        </p>
      ) : null}
    </div>
  );
}
