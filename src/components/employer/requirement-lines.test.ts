import { describe, expect, it } from "vitest";

import { requirementLineSchema } from "@/modules/operations/schemas";

import { emptyLine, serializeLines } from "./requirement-lines-data";

describe("serializeLines", () => {
  it("turns blank optional fields into undefined so the operations schema accepts them", () => {
    const [line] = serializeLines([{ ...emptyLine(), roleTitle: " Pipe fitter ", positions: "12" }]);
    expect(line).toMatchObject({ roleTitle: "Pipe fitter", positions: "12", salaryMin: undefined, salaryCurrency: undefined, requiredSkills: [] });
    expect(requirementLineSchema.safeParse(JSON.parse(JSON.stringify(line))).success).toBe(true);
  });

  it("keeps salary details and existing line ids", () => {
    const [line] = serializeLines([
      { ...emptyLine("AED"), id: "6f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f", roleTitle: "Rigger", positions: "4", salaryMin: "1800", salaryMax: "2200", salaryPeriod: "month", requiredSkills: ["Rigging"] },
    ]);
    const parsed = requirementLineSchema.safeParse(JSON.parse(JSON.stringify(line)));
    expect(parsed.success).toBe(true);
    expect(line).toMatchObject({ id: "6f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f", salaryCurrency: "AED", salaryPeriod: "month" });
  });

  it("lets the schema report a missing currency when a salary is given", () => {
    const [line] = serializeLines([{ ...emptyLine(), roleTitle: "Welder", positions: "2", salaryMin: "500" }]);
    expect(requirementLineSchema.safeParse(JSON.parse(JSON.stringify(line))).success).toBe(false);
  });
});
