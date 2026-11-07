/**
 * Schema barrel — the single entry point used by the Drizzle client and drizzle-kit.
 * Order mirrors the layering in docs/DATA_MODEL.md (a file may only import from earlier layers).
 */
export * from "./_constants";
export * from "./taxonomy"; // 1
export * from "./core"; // 2
export * from "./identity"; // 3
export * from "./organizations"; // 4
export * from "./system"; // 5
export * from "./employers"; // 6
export * from "./partners"; // 7
export * from "./candidates"; // 8
export * from "./operations"; // 9
export * from "./jobs"; // 10
export * from "./training"; // 11
export * from "./recruitment"; // 12
export * from "./commercial"; // 13
export * from "./notifications"; // 14
export * from "./content"; // 15
export * from "./analytics"; // 16
