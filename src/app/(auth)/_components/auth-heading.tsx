import type { ReactNode } from "react";

/** Page heading used by every auth screen (one h1 per page). */
export function AuthHeading({ title, description, eyebrow }: { title: string; description?: ReactNode; eyebrow?: string }) {
  return (
    <header className="space-y-2">
      {eyebrow ? <p className="text-sm font-semibold tracking-wide text-teal-strong uppercase">{eyebrow}</p> : null}
      <h1 className="font-heading text-2xl font-bold text-navy sm:text-3xl">{title}</h1>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </header>
  );
}

export function AuthLinks({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
