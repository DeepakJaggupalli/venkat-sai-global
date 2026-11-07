"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { SellerDetailsSetting } from "@/config/settings";
import { createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { audit } from "@/modules/audit";
import { requireStaff } from "@/modules/identity/authz";
import { setSetting } from "@/modules/settings";

const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;

const sellerSchema = z
  .object({
    legalName: f.text({ label: "Legal name", max: 200 }),
    addressLine1: f.text({ label: "Address", max: 200 }),
    addressLine2: f.optionalText(200),
    city: f.text({ label: "City", max: 100 }),
    stateRegion: f.optionalText(100),
    postalCode: f.optionalText(20),
    countryCode: f.countryCode(),
    stateCode: z.string().trim().max(10).optional(),
    taxId: z.string().trim().toUpperCase().max(30).optional(),
    email: z.email("Enter a valid email address").optional(),
    phone: f.optionalText(30),
    paymentInstructions: f.optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.countryCode === "IN") {
      if (!v.stateCode || !/^[0-9]{2}$/.test(v.stateCode)) ctx.addIssue({ code: "custom", path: ["stateCode"], message: "Choose the GST state code of the place of business" });
      if (v.taxId) {
        if (!GSTIN_RE.test(v.taxId)) ctx.addIssue({ code: "custom", path: ["taxId"], message: "Enter a valid 15-character GSTIN, or leave it blank if not registered" });
        else if (v.stateCode && v.taxId.slice(0, 2) !== v.stateCode) ctx.addIssue({ code: "custom", path: ["taxId"], message: "The GSTIN does not match the state code" });
      }
    }
  });

/**
 * Saves the `commercial.seller_details` setting printed on invoices. A blank GSTIN means the business is not
 * GST-registered: no GST is charged and documents are titled "Invoice". Issued invoices keep their frozen snapshot.
 */
export const saveSellerDetailsAction = createFormAction(sellerSchema, async (input) => {
  const staff = await requireStaff("commercial.plans");
  const value: SellerDetailsSetting = {
    legalName: input.legalName,
    address: [input.addressLine1, input.addressLine2, input.city, input.postalCode].filter(Boolean).join(", "),
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    stateRegion: input.stateRegion,
    postalCode: input.postalCode,
    countryCode: input.countryCode,
    stateCode: input.stateCode ?? "",
    taxId: input.taxId ?? "",
    taxIdType: input.taxId ? (input.countryCode === "IN" ? "gstin" : "other") : undefined,
    email: input.email,
    phone: input.phone,
    paymentInstructions: input.paymentInstructions,
  };
  await setSetting("commercial.seller_details", value, staff.user.id);
  await audit({
    action: "commercial.seller_details_updated",
    entityType: "platform_setting",
    entityId: null,
    metadata: { gstRegistered: Boolean(input.taxId), countryCode: input.countryCode, stateCode: input.stateCode ?? null },
  });
  revalidatePath("/admin/commercial", "layout");
  return ok(undefined, "Seller details saved");
});
