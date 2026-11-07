import { BadgeCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { avatarTone, orgInitials } from "./avatar-utils";
import { TONE_STYLES } from "./tones";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, { root: string; text: string; badge: string }> = {
  xs: { root: "size-6", text: "text-[0.625rem]", badge: "size-3" },
  sm: { root: "size-8", text: "text-xs", badge: "size-3.5" },
  md: { root: "size-10", text: "text-sm", badge: "size-4" },
  lg: { root: "size-14", text: "text-lg", badge: "size-5" },
  xl: { root: "size-20", text: "text-2xl", badge: "size-6" },
};

type BaseAvatarProps = {
  name: string | null | undefined;
  /** Image URL from the files module (`fileUrl()`); falls back to initials while loading or on error. */
  src?: string | null;
  size?: AvatarSize;
  /**
   * Decorative avatars next to a visible name should stay hidden from screen readers (default).
   * Set `labelled` when the avatar stands alone, so it is announced by name.
   */
  labelled?: boolean;
  className?: string;
};

/**
 * Person avatar with an initials fallback (deterministic soft colour per name).
 *
 *   <UserAvatar name={user.name} src={photoUrl} size="md" />
 */
export function UserAvatar({ name, src, size = "md", labelled = false, className }: BaseAvatarProps) {
  const sizes = SIZE_CLASSES[size];
  const tone = TONE_STYLES[avatarTone(name)];
  return (
    <Avatar
      data-slot="user-avatar"
      className={cn(sizes.root, className)}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? (name ?? "Unknown person") : undefined}
    >
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className={cn("font-semibold", sizes.text, tone.soft)}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

type OrgAvatarProps = BaseAvatarProps & {
  /** Show a verified tick (only for organisations verified by Venkat Sai). */
  verified?: boolean;
};

/**
 * Organisation logo with a rounded-square initials fallback.
 *
 *   <OrgAvatar name={org.name} src={logoUrl} verified={org.status === "verified"} />
 */
export function OrgAvatar({ name, src, size = "md", labelled = false, verified = false, className }: OrgAvatarProps) {
  const sizes = SIZE_CLASSES[size];
  const tone = TONE_STYLES[avatarTone(name)];
  return (
    <span className={cn("relative inline-flex shrink-0", className)} data-slot="org-avatar">
      <Avatar
        className={cn(sizes.root, "rounded-lg after:rounded-lg")}
        aria-hidden={labelled ? undefined : true}
        role={labelled ? "img" : undefined}
        aria-label={labelled ? `${name ?? "Organisation"}${verified ? " (verified)" : ""}` : undefined}
      >
        {src ? <AvatarImage src={src} alt="" className="rounded-lg bg-white object-contain p-0.5" /> : null}
        <AvatarFallback className={cn("rounded-lg font-semibold", sizes.text, tone.soft)}>{orgInitials(name)}</AvatarFallback>
      </Avatar>
      {verified ? (
        <span
          aria-hidden={labelled ? true : undefined}
          className={cn("absolute -right-1 -bottom-1 flex items-center justify-center rounded-full bg-card text-teal-strong", sizes.badge)}
        >
          <BadgeCheck className="size-full" />
          {!labelled ? <span className="sr-only">Verified organisation</span> : null}
        </span>
      ) : null}
    </span>
  );
}
