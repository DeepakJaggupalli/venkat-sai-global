import { Building2, ChevronRight, GraduationCap, Handshake, Plane, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { SIGNUP_INTENTS, type SignupIntent } from "@/modules/identity/types";

const ICONS: Record<SignupIntent, LucideIcon> = {
  candidate: UserRound,
  travel_agency: Plane,
  employer: Building2,
  partner: Handshake,
  institution: GraduationCap,
};

export type AccountTypeItem = { intent: SignupIntent; title: string; hint: string; href: string };

/** Build the five account-type items in display order (labels from the "auth" namespace). */
export function accountTypeItems(t: (key: string) => string, hrefFor: (intent: SignupIntent) => string): AccountTypeItem[] {
  return SIGNUP_INTENTS.map((intent) => ({
    intent,
    title: t(`accountType.${intent}.title`),
    hint: t(`accountType.${intent}.hint`),
    href: hrefFor(intent),
  }));
}

/**
 * "I am a…" account types (Job seeker, Travel agency, Company / HR, Recruitment partner, Training institute).
 * Plain links (work without JavaScript): `cards` is the sign-up first step; `tabs` is the compact row shown above
 * the sign-in form and above the sign-up form once a type is chosen. The chosen type carries aria-current.
 */
export function AccountTypeChoice({
  label,
  hint,
  items,
  selected,
  variant,
}: {
  label: string;
  hint?: string;
  items: AccountTypeItem[];
  selected: SignupIntent | null;
  variant: "cards" | "tabs";
}) {
  const labelId = `account-type-${variant}-label`;
  return (
    <nav aria-labelledby={labelId} className="space-y-2" data-testid="account-types">
      <p id={labelId} className={cn("font-medium text-foreground", variant === "cards" ? "text-base" : "text-sm")}>
        {label}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {variant === "cards" ? (
        <ul className="grid gap-2.5">
          {items.map((item) => {
            const Icon = ICONS[item.intent];
            return (
              <li key={item.intent}>
                <Link
                  href={item.href}
                  data-intent={item.intent}
                  aria-current={item.intent === selected ? "true" : undefined}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-background p-3.5 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=true]:border-primary aria-[current=true]:bg-primary/5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal-strong" aria-hidden="true">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-foreground">{item.title}</span>
                    <span className="block text-sm text-muted-foreground">{item.hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => {
            const Icon = ICONS[item.intent];
            const current = item.intent === selected;
            return (
              <li key={item.intent}>
                <Link
                  href={item.href}
                  data-intent={item.intent}
                  aria-current={current ? "true" : undefined}
                  title={item.hint}
                  scroll={false}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=true]:border-primary aria-[current=true]:bg-primary/5 aria-[current=true]:text-foreground"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
