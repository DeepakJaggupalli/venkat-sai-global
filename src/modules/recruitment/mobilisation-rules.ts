/**
 * Overseas mobilisation rules (pure, client-safe): the default checklist created with a mobilisation
 * record, the status gates that keep a worker from travelling before clearances are in place, and
 * candidate-facing status labels.
 *
 * Regulatory context (docs/research/regulatory-notes.md — to be confirmed by counsel): Indian
 * workers holding an ECR passport need emigration clearance through eMigrate before taking up
 * employment in ECR-notified countries, and a Pravasi Bharatiya Bima Yojana (PBBY) policy; workers
 * must travel on an employment visa with a signed contract. The Indian programme is called
 * Pre-Departure Orientation Training (PDOT); the schema column is `pdosCompleted`.
 */
import type { EmigrationCheckStatus } from "@/db/schema/candidates";
import type {
  EmigrationClearanceStatus,
  MobilisationChecklistCategory,
  MobilisationChecklistStatus,
  MobilisationMedicalStatus,
  MobilisationResponsibleParty,
  MobilisationStatus,
  MobilisationVisaStatus,
} from "@/db/schema/recruitment";

export type ChecklistTemplateItem = {
  key: string;
  item: string;
  description: string;
  category: MobilisationChecklistCategory;
  responsibleParty: MobilisationResponsibleParty;
  isRequired: boolean;
  isCandidateVisible: boolean;
  sortOrder: number;
};

/**
 * Default checklist for an overseas placement. Emigration clearance and PBBY insurance are required
 * unless the candidate declared an ECNR passport or a non-Indian passport (staff can still change
 * any item, e.g. mark it not applicable after checking the passport).
 */
export function defaultMobilisationChecklist(input: { emigrationCheckStatus: EmigrationCheckStatus | null }): ChecklistTemplateItem[] {
  const ecrMayApply = input.emigrationCheckStatus !== "ecnr" && input.emigrationCheckStatus !== "not_applicable";
  const items: Omit<ChecklistTemplateItem, "sortOrder">[] = [
    {
      key: "passport_validity",
      item: "Passport valid for travel",
      description: "Upload a clear copy of your passport. It must stay valid for the period the destination country requires.",
      category: "document",
      responsibleParty: "candidate",
      isRequired: true,
      isCandidateVisible: true,
    },
    {
      key: "medical_fitness",
      item: "Pre-employment medical fitness",
      description: "Attend the medical examination you are booked for and upload the fitness certificate. Only the result is recorded, never medical details.",
      category: "medical",
      responsibleParty: "candidate",
      isRequired: true,
      isCandidateVisible: true,
    },
    {
      key: "employment_visa",
      item: "Employment visa",
      description: "The work visa for the destination country. Never travel for work on a tourist or visit visa.",
      category: "visa",
      responsibleParty: "venkat_sai",
      isRequired: true,
      isCandidateVisible: true,
    },
    {
      key: "emigration_clearance",
      item: "Emigration clearance (eMigrate), where applicable",
      description: "Needed for Indian passport holders with ECR status who are going to work in an ECR-notified country.",
      category: "emigration",
      responsibleParty: "venkat_sai",
      isRequired: ecrMayApply,
      isCandidateVisible: true,
    },
    {
      key: "pre_departure_orientation",
      item: "Pre-departure orientation training (PDOT)",
      description: "Orientation on the destination country, the emigration process, your rights and welfare support.",
      category: "orientation",
      responsibleParty: "candidate",
      isRequired: true,
      isCandidateVisible: true,
    },
    {
      key: "employment_contract",
      item: "Signed employment contract",
      description: "The employment contract signed by the employer and by you. Read it carefully before you sign.",
      category: "document",
      responsibleParty: "venkat_sai",
      isRequired: true,
      isCandidateVisible: true,
    },
    {
      key: "travel_ticket",
      item: "Travel ticket",
      description: "Your confirmed ticket to the destination.",
      category: "travel",
      responsibleParty: "venkat_sai",
      isRequired: true,
      isCandidateVisible: true,
    },
    {
      key: "insurance",
      item: "Insurance cover",
      description: "Insurance for the overseas assignment. Indian workers with an ECR passport going to an ECR country need a Pravasi Bharatiya Bima Yojana (PBBY) policy.",
      category: "insurance",
      responsibleParty: "venkat_sai",
      isRequired: true,
      isCandidateVisible: true,
    },
  ];
  return items.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }));
}

/** Forward order of the main mobilisation path (on_hold / cancelled are side states). */
export const MOBILISATION_PATH: readonly MobilisationStatus[] = [
  "not_started",
  "documents_pending",
  "medical",
  "visa_processing",
  "emigration_clearance",
  "travel_booked",
  "departed",
  "arrived",
  "completed",
];

export function mobilisationRank(status: MobilisationStatus): number {
  return MOBILISATION_PATH.indexOf(status);
}

export type MobilisationGateInput = {
  status: MobilisationStatus;
  emigrationClearanceStatus: EmigrationClearanceStatus;
  visaStatus: MobilisationVisaStatus;
  medicalStatus: MobilisationMedicalStatus;
  checklist: readonly { item: string; isRequired: boolean; status: MobilisationChecklistStatus }[];
};

export type MobilisationGateResult = { allowed: true } | { allowed: false; message: string; missing: string[] };

const DONE_ITEM: readonly MobilisationChecklistStatus[] = ["verified", "not_applicable"];

/**
 * May the record move to `to`?
 *  - cancelled / completed records are final; completion needs arrival first;
 *  - booking travel (and anything after) needs emigration clearance assessed (granted or not required),
 *    a visa (approved / issued / not required) and a fit (or not required) medical;
 *  - departure (and after) needs every required checklist item verified or marked not applicable.
 */
export function mobilisationTransitionGate(current: MobilisationGateInput, to: MobilisationStatus): MobilisationGateResult {
  if (current.status === to) return { allowed: true };
  if (current.status === "cancelled" || current.status === "completed") {
    return { allowed: false, message: "This mobilisation is closed.", missing: [] };
  }
  if (to === "completed" && current.status !== "arrived" && current.status !== "departed") {
    return { allowed: false, message: "Record the arrival before completing the mobilisation.", missing: [] };
  }
  const rankTo = mobilisationRank(to);
  const missing: string[] = [];
  if (rankTo >= mobilisationRank("travel_booked")) {
    if (current.emigrationClearanceStatus !== "granted" && current.emigrationClearanceStatus !== "not_required") missing.push("Emigration clearance (granted or confirmed not required)");
    if (!["approved", "issued", "not_required"].includes(current.visaStatus)) missing.push("Employment visa (approved or issued)");
    if (current.medicalStatus !== "fit" && current.medicalStatus !== "not_required") missing.push("Medical fitness result");
  }
  if (rankTo >= mobilisationRank("departed")) {
    for (const item of current.checklist) {
      if (item.isRequired && !DONE_ITEM.includes(item.status)) missing.push(item.item);
    }
  }
  if (missing.length) {
    return { allowed: false, message: `Complete these steps first: ${missing.join("; ")}.`, missing };
  }
  return { allowed: true };
}

/** Candidate-facing labels for mobilisation statuses (English; the People Portal translates by key). */
export const MOBILISATION_STATUS_LABELS: Readonly<Record<MobilisationStatus, string>> = {
  not_started: "Not started",
  documents_pending: "Documents needed",
  medical: "Medical check",
  visa_processing: "Visa in process",
  emigration_clearance: "Emigration clearance",
  travel_booked: "Travel booked",
  departed: "Departed",
  arrived: "Arrived",
  completed: "Completed",
  on_hold: "On hold",
  cancelled: "Cancelled",
};
