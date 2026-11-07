import { cn } from "@/lib/utils";

/**
 * Native checkbox group posting `name[]` values (works without JavaScript). Errors are linked with
 * aria-describedby; the legend names the group for screen readers.
 */
export function CheckGroup({
  name,
  legend,
  hint,
  options,
  defaultValues = [],
  errors,
  columns = 2,
  required,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: readonly { value: string; label: string; description?: string }[];
  defaultValues?: readonly string[];
  errors?: string[];
  columns?: 1 | 2 | 3;
  required?: boolean;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = errors?.length ? `${name}-error` : undefined;
  return (
    <fieldset className="space-y-2" aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined} aria-invalid={errors?.length ? true : undefined}>
      <legend className="text-sm font-medium text-foreground">
        {legend}
        {required ? (
          <span className="text-danger-strong" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </legend>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          return (
            <div key={o.value} className="flex items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5">
              <input
                id={id}
                type="checkbox"
                name={`${name}[]`}
                value={o.value}
                defaultChecked={defaultValues.includes(o.value)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <label htmlFor={id} className="text-sm leading-5 text-foreground">
                {o.label}
                {o.description ? <span className="block text-xs text-muted-foreground">{o.description}</span> : null}
              </label>
            </div>
          );
        })}
      </div>
      {errors?.length ? (
        <p id={errorId} className="text-sm font-medium text-danger-strong">
          {errors[0]}
        </p>
      ) : null}
    </fieldset>
  );
}
