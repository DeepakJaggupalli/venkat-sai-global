"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";
import type { ActionResult, ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

/**
 * Building blocks shared by the auth screens and the account pages: an action hook that does
 * not reset the form on error, accessible fields with linked hints/errors, the form alert,
 * a password field with a visibility toggle and the 6-digit code input.
 */

type FormActionFn<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

/**
 * Wraps useActionState. Submitting through onSubmit + startTransition keeps what the user typed
 * when the server returns an error (React resets forms submitted through the `action` prop);
 * the `action` prop still works without JavaScript.
 */
export function useFormAction<T>(action: FormActionFn<T>) {
  const [state, formAction, pending] = useActionState<ActionState<T>, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(() => formAction(formData));
    },
    [formAction],
  );

  useEffect(() => {
    if (!state || state.ok || !formRef.current) return;
    // Move focus to the first invalid field, or to the form-level alert.
    const target =
      formRef.current.querySelector<HTMLElement>('[aria-invalid="true"]:not([type="hidden"])') ??
      formRef.current.querySelector<HTMLElement>("[data-form-alert]");
    target?.focus();
  }, [state]);

  return { state, formAction, pending, onSubmit, formRef };
}

export function fieldErrors(state: ActionState<unknown>, field: string): string[] | undefined {
  return state && !state.ok ? state.fieldErrors?.[field] : undefined;
}

export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

export function FormAlert({ state, className }: { state: ActionState<unknown>; className?: string }) {
  if (!state) return null;
  if (state.ok) {
    if (!state.message) return null;
    return (
      <Alert role="status" className={cn("border-success/30 bg-success-soft text-foreground", className)}>
        <CheckCircle2 className="text-success" aria-hidden />
        <AlertDescription className="text-foreground">{state.message}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive" data-form-alert tabIndex={-1} className={cn("border-destructive/30 bg-danger-soft", className)}>
      <AlertCircle aria-hidden />
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

export function FieldMessage({ id, messages }: { id?: string; messages?: string[] }) {
  if (!id || !messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

export function SubmitButton({
  pending,
  children,
  className,
  disabled,
  type = "submit",
  ...props
}: ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button type={type} size="lg" className={cn("h-10 w-full", className)} disabled={pending || disabled} aria-busy={pending || undefined} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}

/** Run `effect` once for each new successful result of a form action. */
export function useOnSuccess<T>(state: ActionState<T>, effect: (result: Extract<ActionResult<T>, { ok: true }>) => void): void {
  const handled = useRef<ActionState<T>>(null);
  const latest = useRef(effect);
  useEffect(() => {
    latest.current = effect;
  });
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      latest.current(state);
    }
  }, [state]);
}

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "name"> & {
  id: string;
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  errors?: string[];
  labelAction?: ReactNode;
  containerClassName?: string;
};

export function TextField({ id, name, label, hint, errors, labelAction, containerClassName, className, ...inputProps }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  return (
    <div className={cn("space-y-2", containerClassName)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <Input
        id={id}
        name={name}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        className={cn("h-10", className)}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldMessage id={errorId} messages={errors} />
    </div>
  );
}

export function PasswordField({ id, name, label, hint, errors, labelAction, containerClassName, className, ...inputProps }: TextFieldProps) {
  const t = useT("auth");
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  return (
    <div className={cn("space-y-2", containerClassName)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={describedBy(hintId, errorId)}
          className={cn("h-10 pr-11", className)}
          {...inputProps}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          aria-label={t("fields.showPassword")}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldMessage id={errorId} messages={errors} />
    </div>
  );
}

export function OtpField({
  id,
  name = "code",
  label,
  hint,
  errors,
  autoFocus,
  disabled,
}: {
  id: string;
  name?: string;
  label: ReactNode;
  hint?: ReactNode;
  errors?: string[];
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const invalid = Boolean(errorId);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <InputOTP
        id={id}
        name={name}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(hintId, errorId)}
        containerClassName="justify-start"
      >
        <InputOTPGroup>
          {Array.from({ length: 6 }, (_, index) => (
            <InputOTPSlot key={index} index={index} aria-invalid={invalid || undefined} className="size-11 text-lg sm:size-12" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldMessage id={errorId} messages={errors} />
    </div>
  );
}

/** Native <select> styled like the inputs (better than a custom listbox for long lists on phones). */
export function SelectField({
  id,
  name,
  label,
  hint,
  errors,
  options,
  defaultValue,
}: {
  id: string;
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  errors?: string[];
  options: { value: string; label: string; lang?: string }[];
  defaultValue?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} lang={option.lang}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldMessage id={errorId} messages={errors} />
    </div>
  );
}

function subscribeToClock(onTick: () => void): () => void {
  const timer = window.setInterval(onTick, 1000);
  return () => window.clearInterval(timer);
}
const clockSnapshot = (): number => Math.floor(Date.now() / 1000);
const serverClockSnapshot = (): null => null;

/** Seconds until `availableAt`, ticking every second; null during server render / hydration. */
export function useCountdown(availableAt: number): number | null {
  const nowSeconds = useSyncExternalStore(subscribeToClock, clockSnapshot, serverClockSnapshot);
  if (nowSeconds === null) return null;
  return Math.max(0, Math.ceil(availableAt / 1000) - nowSeconds);
}
