import "server-only";

import { loadPosterCountries } from "@/components/public/requirements/data";
import { pushPublicKey } from "@/modules/push/service";

import { JobAlertsButton } from "./job-alerts-button";
import { ServiceWorkerRegister } from "./sw-register";

function configuredKey(): string | null {
  try {
    return pushPublicKey();
  } catch {
    return null;
  }
}

/** Public layout: registers the alerts service worker only when Web Push is configured. */
export function PushServiceWorker() {
  return configuredKey() ? <ServiceWorkerRegister /> : null;
}

/**
 * Server wrapper: renders the job-alerts button only when Web Push is configured (VAPID keys set). Country
 * choices are the destinations with published posters (`countries`, or loaded here with `loadCountries`).
 */
export async function JobAlerts({
  countries,
  loadCountries = false,
  defaultCountry,
  className,
}: {
  countries?: { code: string; name: string }[];
  loadCountries?: boolean;
  defaultCountry?: string | null;
  className?: string;
}) {
  const publicKey = configuredKey();
  if (!publicKey) return null;
  const options = countries ?? (loadCountries ? await loadPosterCountries() : []);
  return <JobAlertsButton publicKey={publicKey} countries={options} defaultCountry={defaultCountry} className={className} />;
}
