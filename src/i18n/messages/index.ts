/* Static registry of message catalogues (generated layout; keep in sync with NAMESPACES/LOCALES). */
import type { Locale, Messages, Namespace } from "../config";

import en_common from "./en/common.json";
import en_auth from "./en/auth.json";
import en_talent_dashboard from "./en/talent-dashboard.json";
import en_talent_profile from "./en/talent-profile.json";
import en_talent_jobs from "./en/talent-jobs.json";
import en_talent_training from "./en/talent-training.json";
import en_talent_account from "./en/talent-account.json";
import en_talent_messages from "./en/talent-messages.json";
import en_public_safety from "./en/public-safety.json";
import hi_common from "./hi/common.json";
import hi_auth from "./hi/auth.json";
import hi_talent_dashboard from "./hi/talent-dashboard.json";
import hi_talent_profile from "./hi/talent-profile.json";
import hi_talent_jobs from "./hi/talent-jobs.json";
import hi_talent_training from "./hi/talent-training.json";
import hi_talent_account from "./hi/talent-account.json";
import hi_talent_messages from "./hi/talent-messages.json";
import hi_public_safety from "./hi/public-safety.json";
import te_common from "./te/common.json";
import te_auth from "./te/auth.json";
import te_talent_dashboard from "./te/talent-dashboard.json";
import te_talent_profile from "./te/talent-profile.json";
import te_talent_jobs from "./te/talent-jobs.json";
import te_talent_training from "./te/talent-training.json";
import te_talent_account from "./te/talent-account.json";
import te_talent_messages from "./te/talent-messages.json";
import te_public_safety from "./te/public-safety.json";

export const MESSAGES: Record<Locale, Record<Namespace, Messages>> = {
  en: {
    "common": en_common as Messages,
    "auth": en_auth as Messages,
    "talent-dashboard": en_talent_dashboard as Messages,
    "talent-profile": en_talent_profile as Messages,
    "talent-jobs": en_talent_jobs as Messages,
    "talent-training": en_talent_training as Messages,
    "talent-account": en_talent_account as Messages,
    "talent-messages": en_talent_messages as Messages,
    "public-safety": en_public_safety as Messages,
  },
  hi: {
    "common": hi_common as Messages,
    "auth": hi_auth as Messages,
    "talent-dashboard": hi_talent_dashboard as Messages,
    "talent-profile": hi_talent_profile as Messages,
    "talent-jobs": hi_talent_jobs as Messages,
    "talent-training": hi_talent_training as Messages,
    "talent-account": hi_talent_account as Messages,
    "talent-messages": hi_talent_messages as Messages,
    "public-safety": hi_public_safety as Messages,
  },
  te: {
    "common": te_common as Messages,
    "auth": te_auth as Messages,
    "talent-dashboard": te_talent_dashboard as Messages,
    "talent-profile": te_talent_profile as Messages,
    "talent-jobs": te_talent_jobs as Messages,
    "talent-training": te_talent_training as Messages,
    "talent-account": te_talent_account as Messages,
    "talent-messages": te_talent_messages as Messages,
    "public-safety": te_public_safety as Messages,
  },
};
