"use server";

import { revalidatePath } from "next/cache";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";

import { campaignFormSchema, funnelActiveSchema, funnelFormSchema, idSchema } from "./schemas";
import { deleteCampaign, deleteFunnel, saveCampaign, saveFunnel, setFunnelActive } from "./service";

/**
 * Server Actions for /admin/analytics (thin: authorise → validate → service → revalidate).
 * Forms: `useActionState(saveCampaignAction, null)`; funnel steps are posted as `steps:json`.
 */

const ANALYTICS_ADMIN_PATH = "/admin/analytics";

export const saveCampaignAction = createFormAction(campaignFormSchema, async (input) => {
  const staff = await requireStaff("analytics.configure");
  const result = await saveCampaign(staff, input);
  revalidatePath(ANALYTICS_ADMIN_PATH, "layout");
  return ok(result, result.created ? "Campaign added" : "Campaign updated");
});

export const deleteCampaignAction = createAction(idSchema, async ({ id }) => {
  const staff = await requireStaff("analytics.configure");
  await deleteCampaign(staff, id);
  revalidatePath(ANALYTICS_ADMIN_PATH, "layout");
  return ok(undefined, "Campaign deleted");
});

export const saveFunnelAction = createFormAction(funnelFormSchema, async (input) => {
  const staff = await requireStaff("analytics.configure");
  const result = await saveFunnel(staff, input);
  revalidatePath(ANALYTICS_ADMIN_PATH, "layout");
  return ok(result, result.created ? "Funnel created" : "Funnel updated");
});

export const setFunnelActiveAction = createAction(funnelActiveSchema, async ({ id, isActive }) => {
  const staff = await requireStaff("analytics.configure");
  await setFunnelActive(staff, id, isActive);
  revalidatePath(ANALYTICS_ADMIN_PATH, "layout");
  return ok(undefined, isActive ? "Funnel activated" : "Funnel deactivated");
});

export const deleteFunnelAction = createAction(idSchema, async ({ id }) => {
  const staff = await requireStaff("analytics.configure");
  await deleteFunnel(staff, id);
  revalidatePath(ANALYTICS_ADMIN_PATH, "layout");
  return ok(undefined, "Funnel deleted");
});
