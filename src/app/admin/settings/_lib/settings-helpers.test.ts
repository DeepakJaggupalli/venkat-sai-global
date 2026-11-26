import { describe, expect, it } from "vitest";

import { createsCycle, csvToInput, splitSynonyms, TAXONOMIES, TAXONOMY_KINDS } from "../taxonomies/_lib/config";
import { displayValue, mergeSellerDetails, parseSettingValues, sameValue, settingGroups, settingMeta } from "./catalog";
import { csvBool, csvList, csvRecords, parseCsv } from "./csv";

describe("settings catalogue", () => {
  it("groups every key exactly once, in catalogue order", () => {
    const groups = settingGroups();
    const keys = groups.flatMap((g) => g.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(groups[0]!.group).toBe("Security");
  });

  it("derives input kinds from defaults and overrides", () => {
    expect(settingMeta("security.require_staff_2fa").kind).toBe("boolean");
    expect(settingMeta("security.password_min_length")).toMatchObject({ kind: "number", min: 8, max: 128 });
    expect(settingMeta("commercial.default_currency").kind).toBe("currency");
    expect(settingMeta("platform.home_country").kind).toBe("country");
    expect(settingMeta("commercial.seller_details").kind).toBe("seller");
  });

  it("parses booleans, numbers and bounds", () => {
    const r = parseSettingValues(["security.require_staff_2fa", "security.password_min_length", "security.max_failed_logins", "security.lockout_minutes"], {
      "security.require_staff_2fa": "true",
      "security.password_min_length": "6",
      "security.max_failed_logins": "abc",
      "security.lockout_minutes": "30",
    });
    expect(r.values["security.require_staff_2fa"]).toBe(true);
    expect(r.values["security.lockout_minutes"]).toBe(30);
    expect(r.fieldErrors["security.password_min_length"]).toEqual(["Must be at least 8"]);
    expect(r.fieldErrors["security.max_failed_logins"]).toEqual(["Enter a whole number"]);
  });

  it("treats an absent checkbox as off and requires numbers", () => {
    const r = parseSettingValues(["security.require_staff_2fa", "security.lockout_minutes"], {});
    expect(r.values["security.require_staff_2fa"]).toBe(false);
    expect(r.fieldErrors["security.lockout_minutes"]?.[0]).toMatch(/required/);
  });

  it("validates currency and country against known lists", () => {
    const r = parseSettingValues(["commercial.default_currency", "platform.home_country"], { "commercial.default_currency": "usd", "platform.home_country": "zz" }, { currencies: ["USD", "INR"], countries: ["IN"] });
    expect(r.values["commercial.default_currency"]).toBe("USD");
    expect(r.fieldErrors["platform.home_country"]).toEqual(["Choose an active country"]);
  });

  it("validates seller details including GSTIN and state code consistency", () => {
    const base = { "commercial.seller_details.legalName": "Venkat Sai", "commercial.seller_details.address": "Auto Nagar", "commercial.seller_details.stateCode": "37" };
    const ok = parseSettingValues(["commercial.seller_details"], { ...base, "commercial.seller_details.taxId": "37abcde1234f1z5" });
    expect(ok.fieldErrors).toEqual({});
    expect(ok.values["commercial.seller_details"]).toMatchObject({ taxId: "37ABCDE1234F1Z5", stateCode: "37" });
    const mismatch = parseSettingValues(["commercial.seller_details"], { ...base, "commercial.seller_details.taxId": "29ABCDE1234F1Z5" });
    expect(mismatch.fieldErrors["commercial.seller_details.taxId"]?.[0]).toMatch(/must match the state code/);
    const missing = parseSettingValues(["commercial.seller_details"], { "commercial.seller_details.stateCode": "3" });
    expect(Object.keys(missing.fieldErrors).sort()).toEqual(["commercial.seller_details.address", "commercial.seller_details.legalName", "commercial.seller_details.stateCode"]);
  });

  it("compares values ignoring key order and blank fields", () => {
    expect(sameValue({ a: "1", b: "" }, { a: "1" })).toBe(true);
    expect(sameValue({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
    expect(sameValue(5, 6)).toBe(false);
    expect(displayValue(true)).toBe("On");
    expect(displayValue("")).toBe("blank");
  });
});

describe("csv", () => {
  it("parses quotes, escaped quotes, CRLF and BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\nlast,\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["last", ""],
    ]);
  });

  it("maps records by header and strips formula guards added on export", () => {
    const { headers, records } = csvRecords("code,name\nIN,'=India\n");
    expect(headers).toEqual(["code", "name"]);
    expect(records).toEqual([{ code: "IN", name: "=India" }]);
  });

  it("reads yes/no values and lists", () => {
    expect(csvBool("Yes")).toBe(true);
    expect(csvBool("0")).toBe(false);
    expect(csvBool("")).toBeUndefined();
    expect(csvBool("maybe")).toBeNull();
    expect(csvList("a | b;c")).toEqual(["a", "b", "c"]);
  });
});

describe("taxonomy config", () => {
  it("every kind has CSV columns that map to fields or reference columns", () => {
    for (const kind of TAXONOMY_KINDS) {
      const cfg = TAXONOMIES[kind];
      const fields = new Set([...cfg.fields.map((f) => f.name), "parentSlug", "industrySlug", "status"]);
      for (const [, field] of cfg.csv) expect(fields.has(field), `${kind}.${field}`).toBe(true);
    }
  });

  it("maps CSV records to form input, blanks to undefined", () => {
    expect(csvToInput("currencies", { code: "AED", name: "UAE Dirham", symbol: "", other: "x" })).toEqual({ code: "AED", name: "UAE Dirham", symbol: undefined });
  });

  it("splits synonyms without duplicates", () => {
    expect(splitSynonyms("MIG welding, GMAW; mig welding | TIG\n")).toEqual(["MIG welding", "GMAW", "TIG"]);
    expect(splitSynonyms(null)).toEqual([]);
  });

  it("detects parent cycles", () => {
    const parents = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", "b"],
    ]);
    expect(createsCycle("a", "c", parents)).toBe(true);
    expect(createsCycle("c", "a", parents)).toBe(false);
    expect(createsCycle("b", "b", parents)).toBe(true);
    expect(createsCycle("b", null, parents)).toBe(false);
  });
});

describe("seller details saved from the Commercial settings group", () => {
  // As saved by /admin/commercial/seller: structured address lines plus the one-line address it builds from them.
  const stored = {
    legalName: "Venkat Sai Welding Works",
    address: "Plot 5, Auto Nagar, Visakhapatnam, 530012",
    addressLine1: "Plot 5",
    addressLine2: "Auto Nagar",
    city: "Visakhapatnam",
    postalCode: "530012",
    countryCode: "AE",
    stateCode: "",
    taxId: "100123456700003",
    taxIdType: "other",
  };
  /** What the settings form posts: only the fields it shows (blank ones are left out). */
  const form = (overrides: Record<string, string> = {}) => {
    const hidden = new Set(["addressLine1", "addressLine2", "taxIdType", "stateCode"]);
    const shown = Object.fromEntries(Object.entries(stored).filter(([name]) => !hidden.has(name)));
    return { ...shown, ...overrides };
  };

  it("keeps the fields the settings form does not show, so saving without edits changes nothing", () => {
    const merged = mergeSellerDetails(stored, form());
    expect(merged).toMatchObject({ addressLine1: "Plot 5", addressLine2: "Auto Nagar", taxIdType: "other" });
    expect(sameValue(stored, merged)).toBe(true);
  });

  it("drops the stored address lines when the one-line address is changed here", () => {
    const merged = mergeSellerDetails(stored, form({ address: "Gajuwaka, Visakhapatnam" }));
    expect(merged.address).toBe("Gajuwaka, Visakhapatnam");
    expect(merged.addressLine1).toBeUndefined();
    expect(merged.addressLine2).toBeUndefined();
    expect(merged.taxIdType).toBe("other");
  });

  it("drops the stored tax-number type when the tax number is changed here", () => {
    const merged = mergeSellerDetails(stored, form({ taxId: "" }));
    expect(merged.taxIdType).toBeUndefined();
    expect(merged.addressLine1).toBe("Plot 5");
  });

  it("works when nothing is stored yet", () => {
    expect(mergeSellerDetails(undefined, { legalName: "A", address: "B", stateCode: "37" })).toEqual({ legalName: "A", address: "B", stateCode: "37" });
  });
});
