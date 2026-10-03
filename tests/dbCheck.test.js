import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildCheckSql, checksFor, schemaVersion, stampedSchema } from "../scripts/build-db-check.mjs";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const check = readFileSync(new URL("../database-check.sql", import.meta.url), "utf8");

// If either of these fails after editing schema.sql: run `npm run db:check`.
describe("database check", () => {
  it("schema.sql carries the stamp for its current contents", () => {
    expect(schema).toBe(stampedSchema(schema));
    expect(schema).toContain(`schema-version:${schemaVersion(schema)}`);
  });
  it("database-check.sql is up to date with schema.sql", () => {
    expect(check).toBe(buildCheckSql(schema));
  });
  it("covers the objects that matter", () => {
    const labels = checksFor(schema).map(([label]) => label);
    for (const expected of ["Table: invites", "Table: place_pages", "Function: my_profile", "Function: claim_invite",
      "Column: profiles.a11y_prefs", "Trigger: thrones_place_page", 'Old access rule removed: "own fallen writable" on fallen',
      "Privacy: profile settings are hidden from other people"]) {
      expect(labels).toContain(expected);
    }
  });
});
