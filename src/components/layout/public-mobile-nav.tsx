"use client";

import { ArrowRight, ChevronDown, ExternalLink, X } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { WhatsAppIcon } from "@/components/public/contact-links";
import { whatsappHref } from "@/config/contact";
import { BRAND } from "@/config/site";
import { cn } from "@/lib/utils";

import { isExternalHref } from "./nav-utils";
import { PUBLIC_CTA } from "./portal-config";
import { isCurrentPage, isSectionActive } from "./public-nav";
import type { HeaderAccount, PublicNavItem, PublicNavLink } from "./types";

const ROW =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:-outline-offset-2";

const PILL =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

function MobileLink({
  link,
  pathname,
  onNavigate,
  className,
}: {
  link: PublicNavLink;
  pathname: string;
  onNavigate: () => void;
  className?: string;
}) {
  const external = isExternalHref(link.href);
  const current = isCurrentPage(link.href, pathname);
  return (
    <Link
      href={link.href}
      onNavigate={onNavigate}
      aria-current={current ? "page" : undefined}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(ROW, current && "bg-surface-subtle shadow-[inset_3px_0_0_var(--accent-fill)]", className)}
    >
      <span className="min-w-0 flex-1">{link.title}</span>
      {external && (
        <>
          <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </Link>
  );
}

function MobileGroup({ item, pathname, onNavigate }: { item: PublicNavItem; pathname: string; onNavigate: () => void }) {
  const active = isSectionActive(item, pathname);
  return (
    <Collapsible defaultOpen={active}>
      <CollapsibleTrigger className={cn(ROW, "group justify-between")}>
        <span>{item.title}</span>
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul role="list" className="mt-0.5 mb-2 ml-3 space-y-0.5 border-l border-border pl-2">
          {(item.children ?? []).map((child) => (
            <li key={child.href}>
              <MobileLink link={child} pathname={pathname} onNavigate={onNavigate} className="min-h-11 text-sm text-foreground/85" />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Navigation sheet for viewports below xl. Render inside the header's <Sheet> (next to its trigger). */
export function PublicMobileNav({
  items,
  pathname,
  account,
  onNavigate,
}: {
  items: readonly PublicNavItem[];
  pathname: string;
  account: HeaderAccount | null;
  /** Closes the sheet after a client-side navigation. */
  onNavigate: () => void;
}) {
  const close = onNavigate;
  return (
    <SheetContent
      side="right"
      lang="en"
      showCloseButton={false}
      aria-describedby={undefined}
      className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:max-w-sm data-[side=right]:sm:max-w-sm"
    >
      <SheetTitle className="sr-only">Menu</SheetTitle>
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <Link href="/" onNavigate={close} aria-label={`${BRAND.name} home`} className="rounded-md">
          <Logo decorative className="h-8 w-auto" />
        </Link>
        <SheetClose asChild>
          <Button variant="ghost" size="icon" className="-mr-2 size-11 rounded-full" aria-label="Close menu">
            <X className="size-5" aria-hidden />
          </Button>
        </SheetClose>
      </div>

      <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <ul role="list" className="space-y-0.5">
          {items.map((item) => (
            <li key={item.href}>
              {item.children?.length ? (
                <MobileGroup item={item} pathname={pathname} onNavigate={close} />
              ) : (
                <MobileLink link={item} pathname={pathname} onNavigate={close} />
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 space-y-2 border-t border-border p-4">
        {account ? (
          <Link href={account.href} onNavigate={close} className={cn(PILL, "bg-foreground text-white hover:bg-[#26262b]")}>
            Go to {account.portalLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <Link href="/send-cv" onNavigate={close} className={cn(PILL, "bg-foreground text-white hover:bg-[#26262b]")}>
            Send your CV
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={whatsappHref("Hello Venkat Sai, I would like to know about current job requirements.")}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(PILL, "border border-border bg-white text-foreground hover:bg-surface-subtle")}
          >
            <WhatsAppIcon className="size-5 text-green-strong" />
            WhatsApp
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {account ? (
            <Link href={PUBLIC_CTA.postRequirement} onNavigate={close} className={cn(PILL, "border border-border bg-white text-foreground hover:bg-surface-subtle")}>
              Request workers
            </Link>
          ) : (
            <Link href={PUBLIC_CTA.signIn} onNavigate={close} className={cn(PILL, "border border-border bg-white text-foreground hover:bg-surface-subtle")}>
              Sign in
            </Link>
          )}
        </div>
        {!account ? (
          <Link href={PUBLIC_CTA.postRequirement} onNavigate={close} className="flex min-h-11 items-center justify-center rounded-full text-sm font-semibold text-teal-strong underline-offset-4 hover:underline">
            Employer? Request workers
          </Link>
        ) : null}
      </div>
    </SheetContent>
  );
}
