import { CalendarDays, Clock3, Laptop, Wallet } from "lucide-react";

import { printDate, WORK_MODE_LABELS } from "@/modules/documents/content";
import type { PublicProgramme } from "@/modules/documents/service";

/** Mode, length, dates and stipend of an internship as small chips (stipend only when the owner chose to show it). */
export function ProgrammeFacts({ p }: { p: PublicProgramme }) {
  const facts = [
    p.workMode ? { icon: Laptop, text: WORK_MODE_LABELS[p.workMode] } : null,
    p.durationWeeks ? { icon: Clock3, text: `${p.durationWeeks} week${p.durationWeeks === 1 ? "" : "s"}` } : null,
    p.startsOn ? { icon: CalendarDays, text: `Starts ${printDate(p.startsOn)}` } : null,
    p.applicationDeadline ? { icon: CalendarDays, text: `Apply by ${printDate(p.applicationDeadline)}` } : null,
    p.stipendText ? { icon: Wallet, text: p.stipendText } : null,
  ].filter((x): x is { icon: typeof Laptop; text: string } => x !== null);
  if (!facts.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {facts.map((f) => (
        <li key={f.text} className="inline-flex items-center gap-1.5 rounded-full bg-surface-subtle px-3 py-1 text-sm text-foreground">
          <f.icon aria-hidden="true" className="size-4 text-teal-strong" />
          {f.text}
        </li>
      ))}
    </ul>
  );
}
