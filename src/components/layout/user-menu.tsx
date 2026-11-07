"use client";

import { ChevronDown, LifeBuoy, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useShellLang, useShellT } from "./shell-i18n";
import type { ShellUser } from "./types";

export const SIGN_OUT_ACTION = "/sign-out";

function UserAvatar({ user, className }: { user: ShellUser; className?: string }) {
  return (
    <Avatar className={cn("size-9", className)}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
      <AvatarFallback className="bg-navy font-heading text-xs font-bold text-white">{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Account menu: who is signed in, account links and sign-out.
 * Sign-out is a real `<form method="post" action="/sign-out">` (rendered outside the menu so it stays
 * mounted while the menu closes) submitted with requestSubmit().
 */
export function UserMenu({ user, helpHref, className }: { user: ShellUser; helpHref?: string | null; className?: string }) {
  const t = useShellT();
  const lang = useShellLang();
  const signOutForm = useRef<HTMLFormElement>(null);
  const contact = user.email ?? user.phone;

  function signOut() {
    const form = signOutForm.current;
    if (!form) return;
    // requestSubmit is missing on older Safari; submit() is an equivalent fallback for a field-less form.
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();
  }

  return (
    <>
      <form ref={signOutForm} method="post" action={SIGN_OUT_ACTION} className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-full p-1 transition-colors hover:bg-surface-subtle data-[state=open]:bg-surface-subtle sm:pr-2",
              className,
            )}
          >
            <span className="sr-only">
              {t("shell.accountMenu")}: {user.name}
            </span>
            <UserAvatar user={user} />
            <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} lang={lang} className="w-72 p-1.5">
          <div className="flex items-center gap-3 rounded-lg bg-surface-subtle px-2.5 py-3">
            <UserAvatar user={user} className="size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-navy">{user.name}</p>
              {contact && <p className="truncate text-xs text-muted-foreground">{contact}</p>}
            </div>
          </div>
          <DropdownMenuSeparator className="my-1.5" />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild className="gap-2.5 rounded-md px-2 py-2">
              <Link href="/account">
                <UserRound aria-hidden />
                {t("shell.myAccount")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2.5 rounded-md px-2 py-2">
              <Link href="/account/security">
                <ShieldCheck aria-hidden />
                {t("shell.security")}
              </Link>
            </DropdownMenuItem>
            {helpHref && (
              <DropdownMenuItem asChild className="gap-2.5 rounded-md px-2 py-2">
                <Link href={helpHref}>
                  <LifeBuoy aria-hidden />
                  {t("shell.helpAndSupport")}
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="my-1.5" />
          <DropdownMenuItem className="gap-2.5 rounded-md px-2 py-2" onSelect={signOut}>
            <LogOut aria-hidden />
            {t("shell.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
