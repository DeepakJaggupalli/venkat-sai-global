import { describe, expect, it } from "vitest";

import { marketingT } from "../marketing-i18n";
import { heroCtas, REQUIREMENTS_ANCHOR } from "./hero";

const SEND_CV = { label: "Send your CV", href: "/send-cv" };
const JOBS = { label: "Explore jobs", href: "/jobs" };
const APPLY = { label: "Apply for open jobs", href: REQUIREMENTS_ANCHOR };
const CUSTOM = { label: "Walk-in interview on Monday", href: "/events/walk-in" };

describe("heroCtas", () => {
  it("shows Send your CV, then Explore jobs, while no requirement is open (the seeded CMS order too)", () => {
    expect(heroCtas({ hasRequirements: false })).toEqual([SEND_CV, JOBS]);
    expect(heroCtas({ primaryCta: JOBS, secondaryCta: SEND_CV, hasRequirements: false })).toEqual([SEND_CV, JOBS]);
  });

  it("leads with Apply for open jobs (jumping to the list below the hero) when requirements are open", () => {
    expect(REQUIREMENTS_ANCHOR).toBe("#requirements");
    expect(heroCtas({ hasRequirements: true })).toEqual([APPLY, SEND_CV]);
    expect(heroCtas({ primaryCta: JOBS, secondaryCta: SEND_CV, hasRequirements: true })).toEqual([APPLY, SEND_CV]);
    expect(heroCtas({ primaryCta: JOBS, secondaryCta: { label: "Jobs", href: "/jobs" }, hasRequirements: true })).toEqual([APPLY, SEND_CV]);
  });

  it("keeps a CTA an editor set in the CMS in its place", () => {
    expect(heroCtas({ primaryCta: CUSTOM, secondaryCta: SEND_CV, hasRequirements: true })).toEqual([CUSTOM, APPLY]);
    expect(heroCtas({ primaryCta: SEND_CV, secondaryCta: CUSTOM, hasRequirements: true })).toEqual([APPLY, CUSTOM]);
    const other = { label: "Training dates", href: "/training" };
    expect(heroCtas({ primaryCta: CUSTOM, secondaryCta: other, hasRequirements: true })).toEqual([CUSTOM, other]);
    expect(heroCtas({ primaryCta: CUSTOM, secondaryCta: other, hasRequirements: false })).toEqual([CUSTOM, other]);
  });

  it("ignores unusable CMS CTAs (legacy labels, unsafe links)", () => {
    expect(heroCtas({ primaryCta: { label: "Explore opportunities", href: "/opportunities" }, secondaryCta: { label: "Go", href: "javascript:alert(1)" }, hasRequirements: false })).toEqual([SEND_CV, JOBS]);
  });

  it("shows the built-in labels in the page language", () => {
    const t = marketingT("hi");
    expect(heroCtas({ primaryCta: JOBS, secondaryCta: SEND_CV, hasRequirements: true, t })).toEqual([
      { label: t("hero.applyOpenJobs"), href: REQUIREMENTS_ANCHOR },
      { label: t("common.sendCv"), href: "/send-cv" },
    ]);
    expect(heroCtas({ primaryCta: JOBS, secondaryCta: SEND_CV, hasRequirements: false, t })).toEqual([
      { label: t("common.sendCv"), href: "/send-cv" },
      { label: t("common.exploreJobs"), href: "/jobs" },
    ]);
    expect(t("hero.applyOpenJobs")).not.toBe("Apply for open jobs");
  });
});
