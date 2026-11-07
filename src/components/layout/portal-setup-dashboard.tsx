import { ArrowRight, Construction, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { MICRO_LABEL_I18N } from "./shell-styles";

export type SetupLink = { title: string; href: string; icon: LucideIcon };

export type PortalSetupDashboardProps = {
  /** Portal name shown above the greeting. */
  eyebrow: string;
  /** Greeting using the user's real name, e.g. "Welcome, Anil". */
  title: string;
  /** Organisation context for org portals (real organisation name and the viewer's role). */
  context?: string | null;
  statusTitle: string;
  statusDescription: string;
  linksTitle: string;
  /** Quick links into the portal (already filtered by the viewer's permissions). */
  links: readonly SetupLink[];
};

/**
 * Honest placeholder dashboard used until each portal team ships its real dashboard.
 * Shows only real names and links into the portal — no sample figures, charts or activity.
 */
export function PortalSetupDashboard({
  eyebrow,
  title,
  context,
  statusTitle,
  statusDescription,
  linksTitle,
  links,
}: PortalSetupDashboardProps) {
  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative isolate overflow-hidden rounded-2xl bg-navy px-6 py-8 text-white shadow-[0_24px_48px_-32px_rgba(9,19,39,0.65)] sm:px-10 sm:py-10">
        <HeroArc />
        <p className={cn("flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-teal uppercase", MICRO_LABEL_I18N)}>
          <span aria-hidden className="size-1.5 rounded-full bg-gold" />
          {eyebrow}
        </p>
        <h1 className="mt-3 max-w-2xl font-heading text-2xl font-bold text-balance sm:text-3xl">{title}</h1>
        {context && <p className="mt-2 max-w-2xl text-sm text-white/75 sm:text-[15px]">{context}</p>}
      </section>

      <section aria-labelledby="portal-setup-status" className="rounded-2xl border border-border bg-white p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold-strong">
            <Construction className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="portal-setup-status" className="font-heading text-base font-semibold text-navy sm:text-lg">
              {statusTitle}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{statusDescription}</p>
          </div>
        </div>
      </section>

      {links.length > 0 && (
        <section aria-labelledby="portal-setup-links">
          <h2 id="portal-setup-links" className="font-heading text-base font-semibold text-navy">
            {linksTitle}
          </h2>
          <ul role="list" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "group flex h-full items-center gap-4 rounded-xl border border-border bg-white p-4 transition-[border-color,box-shadow,transform] duration-200",
                      "hover:-translate-y-px hover:border-teal/40 hover:shadow-[0_12px_28px_-20px_rgba(16,28,53,0.45)] motion-reduce:hover:translate-y-0",
                    )}
                  >
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-navy transition-colors group-hover:bg-teal-soft group-hover:text-accent-foreground"
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-navy">{link.title}</span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-teal-strong"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Decorative horizon arcs echoing the logo mark. */
function HeroArc() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 400 220"
      fill="none"
      className="pointer-events-none absolute -right-16 -bottom-24 -z-10 h-72 w-[30rem] max-w-none text-teal opacity-25 sm:-right-6"
    >
      <circle cx="220" cy="220" r="150" stroke="currentColor" strokeWidth="2" />
      <circle cx="220" cy="220" r="190" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8" />
      <circle cx="220" cy="220" r="110" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1" />
      <circle cx="338" cy="128" r="5" className="fill-gold" stroke="none" />
    </svg>
  );
}
