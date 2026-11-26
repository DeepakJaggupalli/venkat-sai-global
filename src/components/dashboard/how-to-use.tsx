import { guideFor, PORTAL_HELP_HREF, type GuidePortalKey } from "@/config/portal-guides";

import { HowToUseCard } from "./how-to-use-card";
import type { HowToUseStep } from "./types";

export type HowToUseProps = {
  /** Which portal's quick steps to show (src/config/portal-guides.ts); also the localStorage key. */
  portal: GuidePortalKey;
  /** Viewer's permission keys: steps their role cannot use are left out. Omit for the People Portal. */
  permissions?: readonly string[] | ReadonlySet<string> | null;
  /** Replace the registry steps (already filtered). */
  steps?: readonly HowToUseStep[];
  /** Full guide link. Defaults to the portal's help page (/admin/help, /agency/help…). */
  guideHref?: string;
  title?: string;
  description?: string;
};

/**
 * "How to use" card for a dashboard: 4–6 numbered steps that link straight to the work, plus "Open the full
 * guide". Expanded the first time; "Hide" is remembered per portal on this device. Server component (it renders
 * the icons and passes plain elements to the small client card).
 *
 *   <HowToUse portal="admin" permissions={Array.from(staff.permissions)} />
 *   <HowToUse portal={portal} permissions={Array.from(ctx.permissions)} />   // portal = "employer" | "agency"
 */
export function HowToUse({ portal, permissions = null, steps, guideHref, title = "How to use", description }: HowToUseProps) {
  const source: readonly HowToUseStep[] = steps ?? guideFor(portal, permissions).quickSteps;
  if (source.length === 0) return null;
  return (
    <HowToUseCard
      portal={portal}
      guideHref={guideHref ?? PORTAL_HELP_HREF[portal]}
      title={title}
      description={description ?? `${source.length} quick ${source.length === 1 ? "step" : "steps"} to get the most out of this portal. Tap a step to go straight there.`}
      steps={source.map(({ icon: Icon, title: stepTitle, description: stepDescription, href }) => ({
        title: stepTitle,
        description: stepDescription,
        href,
        icon: Icon ? <Icon /> : undefined,
      }))}
    />
  );
}
