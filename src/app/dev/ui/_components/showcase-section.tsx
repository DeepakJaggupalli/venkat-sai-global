import type { ReactNode } from "react";

import { SectionCard } from "@/components/shared/section-card";

/** A titled block of the showcase; the id makes each section linkable from the index. */
export function ShowcaseSection({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <SectionCard id={id} title={title} description={description} className="scroll-mt-6">
      <div className="space-y-6">{children}</div>
    </SectionCard>
  );
}

/** Small caption above a demo. */
export function DemoLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>;
}
