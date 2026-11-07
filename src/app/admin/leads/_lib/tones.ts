import type { Tone } from "@/components/shared/tones";
import type { LeadStatus } from "@/modules/operations/types";

export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  new: "info",
  contacted: "brand",
  qualified: "brand",
  proposal: "gold",
  nurturing: "neutral",
  won: "success",
  lost: "danger",
};
