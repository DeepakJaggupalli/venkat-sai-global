import { describe, expect, it } from "vitest";

import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_PLACEMENTS,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_STATUSES,
  CMS_COLLECTIONS,
  CMS_ENTRY_STATUSES,
  CMS_SINGLETON_COLLECTIONS,
  CONTENT_CONSENT_STATUSES,
  ENQUIRY_TYPES,
  LOGO_DISPLAY_LOCATIONS,
  LOGO_PERMISSION_STATUSES,
  LOGO_PERMISSION_TYPES,
  LOGO_RELATIONSHIPS,
  MEDIA_KINDS,
  MEDIA_STATUSES,
  MEDIA_VISIBILITIES,
  PUBLIC_METRIC_KEYS,
  PUBLIC_METRIC_MODES,
} from "@/db/schema";
import { MARKET_REGIONS } from "@/db/schema/_constants";

import * as c from "./constants";

const same = (a: readonly string[], b: readonly string[]) => expect([...a].sort()).toEqual([...b].sort());

describe("content constants match the schema", () => {
  it("keeps every value list identical to its schema enum", () => {
    same(c.CMS_COLLECTION_VALUES, CMS_COLLECTIONS);
    same(c.CMS_SINGLETON_VALUES, CMS_SINGLETON_COLLECTIONS);
    same(c.CMS_ENTRY_STATUS_VALUES, CMS_ENTRY_STATUSES);
    same(c.CONTENT_CONSENT_STATUS_VALUES, CONTENT_CONSENT_STATUSES);
    same(c.MEDIA_KIND_VALUES, MEDIA_KINDS);
    same(c.MEDIA_VISIBILITY_VALUES, MEDIA_VISIBILITIES);
    same(c.MEDIA_STATUS_VALUES, MEDIA_STATUSES);
    same(c.LOGO_RELATIONSHIP_VALUES, LOGO_RELATIONSHIPS);
    same(c.LOGO_PERMISSION_TYPE_VALUES, LOGO_PERMISSION_TYPES);
    same(c.LOGO_PERMISSION_STATUS_VALUES, LOGO_PERMISSION_STATUSES);
    same(c.LOGO_DISPLAY_LOCATION_VALUES, LOGO_DISPLAY_LOCATIONS);
    same(c.ANNOUNCEMENT_AUDIENCE_VALUES, ANNOUNCEMENT_AUDIENCES);
    same(c.ANNOUNCEMENT_PLACEMENT_VALUES, ANNOUNCEMENT_PLACEMENTS);
    same(c.ANNOUNCEMENT_PRIORITY_VALUES, ANNOUNCEMENT_PRIORITIES);
    same(c.ANNOUNCEMENT_STATUS_VALUES, ANNOUNCEMENT_STATUSES);
    same(c.PUBLIC_METRIC_MODE_VALUES, PUBLIC_METRIC_MODES);
    same(c.STANDARD_PUBLIC_METRIC_VALUES, PUBLIC_METRIC_KEYS);
    same(c.MARKET_REGION_VALUES, MARKET_REGIONS);
    same(c.ENQUIRY_TYPE_OPTION_VALUES, ENQUIRY_TYPES);
  });

  it("derives singleton slugs and accepts only valid custom metric keys", () => {
    expect(c.singletonSlug("site_settings")).toBe("site-settings");
    expect(c.isSingletonCollection("homepage")).toBe(true);
    expect(c.isSingletonCollection("services")).toBe(false);
    expect(c.CUSTOM_METRIC_KEY_PATTERN.test("custom_welders_trained")).toBe(true);
    expect(c.CUSTOM_METRIC_KEY_PATTERN.test("registered_candidates")).toBe(false);
    expect(c.CUSTOM_METRIC_KEY_PATTERN.test("custom_Bad")).toBe(false);
  });
});
