import { cn } from "@/lib/utils";

/** "12 of 20 booked" with a thin bar (the text carries the meaning; the bar is decorative). */
export function SeatsMeter({ booked, capacity, className }: { booked: number; capacity: number; className?: string }) {
  const ratio = capacity > 0 ? Math.min(1, booked / capacity) : 0;
  const full = booked >= capacity;
  return (
    <div className={cn("min-w-28", className)}>
      <p className="text-sm font-medium text-foreground tabular-nums">
        {booked} of {capacity} booked
      </p>
      <div aria-hidden="true" className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
        <div className={cn("h-full origin-left rounded-full", full ? "bg-warning" : "bg-teal")} style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}
