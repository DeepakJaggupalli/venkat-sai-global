"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { FormErrorAlert, SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { unsubscribeAction } from "@/modules/notifications/actions";

type UnsubscribeFormProps = {
  token: string;
  categoryLabel: string;
  channelLabel: string;
};

/** Confirmation step of the one-click unsubscribe link (GET never changes anything; the button does). */
export function UnsubscribeForm({ token, categoryLabel, channelLabel }: UnsubscribeFormProps) {
  const [state, formAction] = useActionState(unsubscribeAction, null);
  const category = categoryLabel.toLowerCase();
  const channel = channelLabel.toLowerCase();

  if (state?.ok) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-teal-strong" aria-hidden />
          <div className="space-y-2">
            <h1 className="font-heading text-xl font-semibold text-navy">{state.data?.alreadyUnsubscribed ? "You were already unsubscribed" : "You have been unsubscribed"}</h1>
            <p className="text-sm text-muted-foreground">
              You will no longer receive {category} updates by {channel}. Important account, security and transaction messages are still sent.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">You can change this at any time in your notification preferences.</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/account/notifications/preferences">Manage preferences</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go to the home page</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <h1 className="font-heading text-xl font-semibold text-navy">Unsubscribe from {category} {channel}s?</h1>
        <p className="text-sm text-muted-foreground">
          You will stop receiving {category} updates by {channel}. Important account, security and transaction messages will still be sent.
        </p>
      </div>
      <FormErrorAlert state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Unsubscribingâ€¦">Unsubscribe</SubmitButton>
        <Button asChild variant="outline">
          <Link href="/">Keep receiving them</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        To choose exactly which updates you receive, sign in and open{" "}
        <Link href="/account/notifications/preferences" className="font-medium text-teal-strong underline underline-offset-4">
          notification preferences
        </Link>
        .
      </p>
    </form>
  );
}
