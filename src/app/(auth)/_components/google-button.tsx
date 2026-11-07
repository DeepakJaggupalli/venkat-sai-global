import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={className}>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

/**
 * "Continue with Google". A plain <a> (not next/link) because /auth/google is a route handler
 * that sets a cookie and redirects — it must never be prefetched. `href = null` renders it disabled.
 */
export function GoogleButton({ href, label, describedById }: { href: string | null; label: string; describedById?: string }) {
  const className = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 w-full gap-2");
  if (!href) {
    return (
      <button type="button" className={className} disabled aria-describedby={describedById}>
        <GoogleLogo className="size-4" />
        <span>{label}</span>
      </button>
    );
  }
  return (
    <a href={href} className={className} aria-describedby={describedById}>
      <GoogleLogo className="size-4" />
      <span>{label}</span>
    </a>
  );
}

export function OrSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span aria-hidden>{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}
