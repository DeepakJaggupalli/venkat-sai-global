import { describe, expect, it } from "vitest";

import {
  buildWorkerInvoiceLines,
  commonWorkerAmount,
  describeConflict,
  findDoubleInvoicing,
  isInvoiceableWorkerStatus,
  MAX_WORKERS_PER_INVOICE,
  pickWorkerInvoiceCurrency,
  preselectProblem,
  subtotalMinor,
  WORKER_INVOICE_REFERENCE_TYPE,
  workerLineDescription,
  type ExistingWorkerLine,
} from "./worker-invoices-rules";
import { workerInvoiceFormSchema } from "./worker-invoices-schemas";

const RAVI = { id: "11111111-1111-4111-8111-111111111111", name: "  Ravi   Kumar ", tradeLabel: "TIG welder" };
const SITA = { id: "22222222-2222-4222-8222-222222222222", name: "Sita Devi", tradeLabel: "Electrician" };
const ORG = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "44444444-4444-4444-8444-444444444444";

describe("worker invoice lines", () => {
  it("builds one line per worker: description, quantity 1, amount and the CV submission reference, in the order ticked", () => {
    const result = buildWorkerInvoiceLines(
      [RAVI, SITA],
      [
        { submissionId: SITA.id, amount: "15,000.50" },
        { submissionId: RAVI.id, amount: "12000" },
      ],
      "INR",
      2,
    );
    expect(result).toEqual({
      ok: true,
      lines: [
        { description: "Recruitment service charge - Sita Devi (Electrician)", quantity: 1, unitAmount: "15,000.50", referenceType: "cv_submission", referenceId: SITA.id },
        { description: "Recruitment service charge - Ravi Kumar (TIG welder)", quantity: 1, unitAmount: "12000", referenceType: "cv_submission", referenceId: RAVI.id },
      ],
    });
    expect(WORKER_INVOICE_REFERENCE_TYPE).toBe("cv_submission");
  });

  it("checks amounts against the currency's decimals and refuses zero, unknown and repeated workers", () => {
    const kwd = buildWorkerInvoiceLines([RAVI], [{ submissionId: RAVI.id, amount: "12.3456" }], "KWD", 3);
    expect(kwd.ok).toBe(false);
    if (!kwd.ok) expect(kwd.fieldErrors["lines.0.amount"]?.[0]).toMatch(/Ravi Kumar: Use at most 3 decimal places/);
    expect(buildWorkerInvoiceLines([RAVI], [{ submissionId: RAVI.id, amount: "12.345" }], "KWD", 3).ok).toBe(true);
    const jpy = buildWorkerInvoiceLines([RAVI], [{ submissionId: RAVI.id, amount: "1500.5" }], "JPY", 0);
    expect(jpy.ok).toBe(false);

    const zero = buildWorkerInvoiceLines([RAVI], [{ submissionId: RAVI.id, amount: "0.00" }], "INR", 2);
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error).toMatch(/more than zero/);

    const twice = buildWorkerInvoiceLines([RAVI], [{ submissionId: RAVI.id, amount: "1" }, { submissionId: RAVI.id, amount: "1" }], "INR", 2);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.fieldErrors["lines.1.submissionId"]).toEqual(["Ravi Kumar is ticked twice"]);

    const unknown = buildWorkerInvoiceLines([RAVI], [{ submissionId: SITA.id, amount: "1" }], "INR", 2);
    expect(unknown.ok).toBe(false);

    expect(buildWorkerInvoiceLines([RAVI], [], "INR", 2)).toMatchObject({ ok: false, error: "Tick at least one worker." });
    const many = Array.from({ length: MAX_WORKERS_PER_INVOICE + 1 }, () => ({ submissionId: RAVI.id, amount: "1" }));
    expect(buildWorkerInvoiceLines([RAVI], many, "INR", 2)).toMatchObject({ ok: false });
  });

  it("keeps descriptions within 300 characters and handles a missing trade", () => {
    expect(workerLineDescription({ name: "Abdul", tradeLabel: " " })).toBe("Recruitment service charge - Abdul");
    const long = workerLineDescription({ name: "N".repeat(400), tradeLabel: "T".repeat(400) });
    expect(long.length).toBeLessThanOrEqual(300);
    expect(long.startsWith("Recruitment service charge - NNN")).toBe(true);
  });

  it("only selected / medical / visa / ticket / departed workers can be invoiced", () => {
    expect(["selected", "medical", "visa", "ticket", "departed"].every(isInvoiceableWorkerStatus)).toBe(true);
    expect(["received", "contacted", "trade_test", "not_suitable", "on_hold"].some(isInvoiceableWorkerStatus)).toBe(false);
  });
});

describe("currency rule", () => {
  it("uses the chosen currency, else the billing-profile currency, and never assumes INR", () => {
    expect(pickWorkerInvoiceCurrency("aed", "INR")).toBe("AED");
    expect(pickWorkerInvoiceCurrency(undefined, "kwd")).toBe("KWD");
    expect(pickWorkerInvoiceCurrency("", null)).toBeNull();
    expect(pickWorkerInvoiceCurrency(null, undefined)).toBeNull();
    expect(pickWorkerInvoiceCurrency("rupees", null)).toBeNull();
  });

  it("the form requires a currency", () => {
    const base = { organizationId: ORG, lines: [{ submissionId: RAVI.id, amount: "100" }] };
    expect(workerInvoiceFormSchema.safeParse(base).success).toBe(false);
    const parsed = workerInvoiceFormSchema.parse({ ...base, currency: "sgd", intent: "issue" });
    expect(parsed).toMatchObject({ currency: "SGD", intent: "issue" });
    expect(workerInvoiceFormSchema.parse({ ...base, currency: "SGD", intent: "anything" }).intent).toBe("draft");
    expect(workerInvoiceFormSchema.safeParse({ ...base, currency: "SGD", lines: [] }).success).toBe(false);
  });

  it("adds a live subtotal in minor units only when every amount is valid", () => {
    expect(subtotalMinor(["15000", "12,000.50"], "INR", 2)).toBe(2_700_050);
    expect(subtotalMinor(["15000", ""], "INR", 2)).toBeNull();
    expect(subtotalMinor(["1"], null)).toBeNull();
    expect(subtotalMinor(["1.5"], "JPY", 0)).toBeNull();
  });
});

describe("form helpers", () => {
  it("prefills 'Amount per worker' only when every worker shares one amount (never overwrites a line set on its own)", () => {
    expect(commonWorkerAmount(["15000.00", "15000.00"])).toBe("15000.00");
    expect(commonWorkerAmount([" 15000.00", "15000.00 "])).toBe("15000.00");
    expect(commonWorkerAmount(["15000.00", "12000.00"])).toBe("");
    expect(commonWorkerAmount([""])).toBe("");
    expect(commonWorkerAmount([])).toBe("");
  });

  it("says why a worker opened with ?cv= cannot be ticked", () => {
    const ok = { name: "Ravi  Kumar", status: "selected" as const, invoiceable: true, alreadyInvoiced: null };
    expect(preselectProblem(ok, "Gulf Travels")).toBeNull();
    expect(preselectProblem(undefined, "Gulf Travels")).toMatch(/could not be found/);
    expect(preselectProblem({ ...ok, status: "trade_test", invoiceable: false }, null)).toBe(
      "Ravi Kumar is at Trade test / interview. Only workers who are selected, at medical, visa or ticket stage, or departed can be invoiced.",
    );
    expect(preselectProblem({ ...ok, alreadyInvoiced: { invoiceId: "i", code: "VSG/2627/000007", status: "issued" } }, "Gulf Travels")).toBe("Ravi Kumar is already on VSG/2627/000007 for Gulf Travels.");
    expect(preselectProblem({ ...ok, alreadyInvoiced: { invoiceId: "i", code: null, status: "draft" } }, null)).toBe("Ravi Kumar is already on a draft invoice for this organisation.");
  });
});

describe("double invoicing", () => {
  const line = (over: Partial<ExistingWorkerLine>): ExistingWorkerLine => ({ submissionId: RAVI.id, invoiceId: "inv-1", invoiceCode: "VSG/2627/000001", invoiceStatus: "issued", organizationId: ORG, documentType: "invoice", ...over });

  it("blocks a worker already on a non-void invoice (drafts included) of the same organisation", () => {
    expect(findDoubleInvoicing([RAVI.id], [line({})], { organizationId: ORG })).toHaveLength(1);
    expect(findDoubleInvoicing([RAVI.id], [line({ invoiceStatus: "draft", invoiceCode: null })], { organizationId: ORG })).toHaveLength(1);
    expect(findDoubleInvoicing([RAVI.id], [line({ invoiceStatus: "paid" })], { organizationId: ORG })).toHaveLength(1);
  });

  it("allows another organisation, a voided invoice, credit notes and the draft being edited", () => {
    expect(findDoubleInvoicing([RAVI.id], [line({ organizationId: OTHER_ORG })], { organizationId: ORG })).toEqual([]);
    expect(findDoubleInvoicing([RAVI.id], [line({ invoiceStatus: "void" })], { organizationId: ORG })).toEqual([]);
    expect(findDoubleInvoicing([RAVI.id], [line({ documentType: "credit_note" })], { organizationId: ORG })).toEqual([]);
    expect(findDoubleInvoicing([RAVI.id], [line({ invoiceId: "draft-1", invoiceStatus: "draft" })], { organizationId: ORG, excludeInvoiceId: "draft-1" })).toEqual([]);
    expect(findDoubleInvoicing([SITA.id], [line({})], { organizationId: ORG })).toEqual([]);
  });

  it("reports one conflict per worker in plain words", () => {
    const conflicts = findDoubleInvoicing([RAVI.id], [line({ invoiceId: "a" }), line({ invoiceId: "b", invoiceCode: "VSG/2627/000002" })], { organizationId: ORG });
    expect(conflicts).toHaveLength(1);
    expect(describeConflict("Ravi Kumar", conflicts[0]!)).toBe("Ravi Kumar (VSG/2627/000001)");
    expect(describeConflict("Ravi", { invoiceCode: null, invoiceStatus: "draft" })).toBe("Ravi (a draft invoice)");
  });
});
