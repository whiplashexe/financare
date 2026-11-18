import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";

const idFor = async (prefix: string, n: number) => {
  const result = await db.execute<{ id: string }>(
    sql`select prefixed_id(${prefix}, ${n}::bigint) as id`,
  );
  return result.rows[0]!.id;
};

describe("prefixed_id", () => {
  it("pads to at least 3 digits", async () => {
    expect(await idFor("USR", 1)).toBe("USR001");
    expect(await idFor("USR", 42)).toBe("USR042");
    expect(await idFor("USR", 999)).toBe("USR999");
  });

  it("never truncates numbers with more than 3 digits", async () => {
    expect(await idFor("RTK", 1000)).toBe("RTK1000");
    expect(await idFor("RTK", 1078)).toBe("RTK1078");
    expect(await idFor("TRANS", 1234567)).toBe("TRANS1234567");
  });

  it("produces distinct ids for consecutive numbers across the 999 boundary", async () => {
    const ids = await Promise.all(
      [998, 999, 1000, 1001, 1002, 1010, 1011].map((n) => idFor("ACC", n)),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches the id_format check constraints of the tables", async () => {
    for (const n of [1, 999, 1000, 123456]) {
      expect(await idFor("USR", n)).toMatch(/^USR[0-9]{3,}$/);
    }
  });
});

describe("id defaults of the tables", () => {
  it("use prefixed_id instead of lpad", async () => {
    const result = await db.execute<{ table_name: string; column_default: string }>(sql`
      select table_name, column_default from information_schema.columns
      where table_schema = 'public' and column_name = 'id'
        and column_default like '%nextval%'
    `);

    expect(result.rows.length).toBe(14);
    for (const row of result.rows) {
      expect(row.column_default).toContain("prefixed_id");
      expect(row.column_default).not.toContain("lpad");
    }
  });
});
