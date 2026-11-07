import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for the taxonomy typeahead routes. Runs only against an isolated database:
 *   node scripts/test-db.mjs vsg_test_design
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_design'; npx vitest run src/app/api/v1/taxonomy
 */
const url = process.env.DATABASE_URL ?? "";
const enabled = /\/vsg_test_[a-z0-9_]+(\?|$)/.test(url);

const PREFIX = "zz-design-test";

describe.skipIf(!enabled)("taxonomy typeahead routes (database)", () => {
  type Db = typeof import("@/db");
  type Schema = typeof import("@/db/schema");
  let dbModule: Db;
  let schema: Schema;
  let skillsGET: (req: NextRequest) => Promise<Response>;
  let categoriesGET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    dbModule = await import("@/db");
    schema = await import("@/db/schema");
    skillsGET = (await import("./skills/route")).GET;
    categoriesGET = (await import("./job-categories/route")).GET;
    const { db } = dbModule;
    const { like } = await import("drizzle-orm");
    await db.delete(schema.skills).where(like(schema.skills.slug, `${PREFIX}%`));
    await db.delete(schema.jobCategories).where(like(schema.jobCategories.slug, `${PREFIX}%`));
    await db.insert(schema.skills).values([
      { slug: `${PREFIX}-tig`, name: "Zqx TIG welding", category: "trade", synonyms: ["Zqx GTAW"] },
      { slug: `${PREFIX}-excel`, name: "Zqx spreadsheet basics", category: "software" },
      { slug: `${PREFIX}-pending`, name: "Zqx pending skill", category: "trade", status: "pending" },
      { slug: `${PREFIX}-inactive`, name: "Zqx inactive skill", category: "trade", isActive: false },
    ]);
    await db.insert(schema.jobCategories).values([
      { slug: `${PREFIX}-weld`, name: "Zqx Welding & Fabrication", sortOrder: 2 },
      { slug: `${PREFIX}-pipe`, name: "Zqx Pipe Fitting 100%", sortOrder: 1 },
      { slug: `${PREFIX}-other`, name: "Other Zqx Trades", sortOrder: 0 },
      { slug: `${PREFIX}-hidden`, name: "Zqx Hidden Category", isActive: false },
    ]);
  });

  afterAll(async () => {
    if (!dbModule) return;
    const { like } = await import("drizzle-orm");
    await dbModule.db.delete(schema.skills).where(like(schema.skills.slug, `${PREFIX}%`));
    await dbModule.db.delete(schema.jobCategories).where(like(schema.jobCategories.slug, `${PREFIX}%`));
    await dbModule.pool.end();
  });

  const get = (handler: (req: NextRequest) => Promise<Response>, path: string) => handler(new NextRequest(`http://localhost${path}`));

  it("returns approved, active skills matched by name or synonym", async () => {
    const res = await get(skillsGET, "/api/v1/taxonomy/skills?q=zqx");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("private");
    const body = (await res.json()) as { items: { name: string; category: string }[] };
    const names = body.items.map((i) => i.name);
    expect(names).toContain("Zqx TIG welding");
    expect(names).not.toContain("Zqx pending skill");
    expect(names).not.toContain("Zqx inactive skill");

    const synonym = (await (await get(skillsGET, "/api/v1/taxonomy/skills?q=gtaw")).json()) as { items: { name: string }[] };
    expect(synonym.items.map((i) => i.name)).toContain("Zqx TIG welding");
  });

  it("filters by category and validates input", async () => {
    const body = (await (await get(skillsGET, "/api/v1/taxonomy/skills?q=zqx&category=software")).json()) as { items: { name: string }[] };
    expect(body.items.map((i) => i.name)).toEqual(["Zqx spreadsheet basics"]);
    expect((await get(skillsGET, "/api/v1/taxonomy/skills?q=zqx&limit=99")).status).toBe(400);
    expect((await get(skillsGET, "/api/v1/taxonomy/skills?q=zqx&category=wizardry")).status).toBe(400);
    const empty = (await (await get(skillsGET, "/api/v1/taxonomy/skills?q=")).json()) as { items: unknown[] };
    expect(empty.items).toEqual([]);
  });

  it("searches active job categories, prefix matches first, wildcards literal", async () => {
    const res = await get(categoriesGET, "/api/v1/taxonomy/job-categories?q=zqx");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { name: string }[] };
    const names = body.items.map((i) => i.name);
    expect(names).not.toContain("Zqx Hidden Category");
    expect(names.indexOf("Other Zqx Trades")).toBeGreaterThan(names.indexOf("Zqx Welding & Fabrication"));

    const literal = (await (await get(categoriesGET, "/api/v1/taxonomy/job-categories?q=100%25")).json()) as { items: { name: string }[] };
    expect(literal.items.map((i) => i.name)).toEqual(["Zqx Pipe Fitting 100%"]);
    expect((await get(categoriesGET, "/api/v1/taxonomy/job-categories?q=zqx&limit=0")).status).toBe(400);
  });
});
