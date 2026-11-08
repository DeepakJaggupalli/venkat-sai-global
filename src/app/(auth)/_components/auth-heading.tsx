import type { ReactNode } from "react";

/** Page heading used by every auth screen (one h1 per page). */
export function AuthHeading({ title, description, eyebrow }: { title: string; description?: ReactNode; eyebrow?: string }) {
  return (
    <header className="space-y-2">
      {eyebrow ? <p className="label-dot">{eyebrow}</p> : null}
      <h1 className="font-display text-[2rem] text-foreground sm:text-[2.5rem]">{title}</h1>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </header>
  );
}

export function AuthLinks({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
