import { describe, expect, it } from "vitest";
import { findSqlInjection, sqlInjection } from "@/lib/engine/checks/sql-injection";
import { makeSnapshot } from "../helpers";

describe("sql-injection", () => {
  it("passes on parameterized queries and tagged templates", () => {
    const src = [
      "await db.query('SELECT * FROM users WHERE id = $1', [id]);",
      "await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);",
      "await sql`SELECT * FROM users WHERE id = ${id}`;",
      "await prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`;",
      "await prisma.$queryRaw(Prisma.sql`SELECT * FROM users WHERE id = ${id}`);",
      "const { data } = useQuery(`/api/users/${id}`);",
      "await exec.execute(`git checkout ${branch}`);",
      "cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))",
      // Ordinary English that happens to use SQL words
      "await logger.execute(`Delete ${n} files from cache`);",
      "await job.query(`Update ${name} settings`);",
    ].join("\n");
    const result = sqlInjection.run(makeSnapshot({ "lib/db.ts": src }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("is na with no downloaded source files", () => {
    expect(sqlInjection.run(makeSnapshot({ "lib/db.ts": null, "README.md": "# hi" })).status).toBe("na");
  });

  it("fails on an interpolated template literal", () => {
    const result = sqlInjection.run(
      makeSnapshot({ "app/api/users/route.ts": "// get user\nconst r = await db.query(`SELECT * FROM users WHERE id = ${id}`);" }),
    );
    expect(result.status).toBe("fail");
    expect(result.files).toEqual([{ path: "app/api/users/route.ts", line: 2 }]);
    expect(result.fix).not.toBe("");
  });

  it("fails on string concatenation", () => {
    const result = sqlInjection.run(makeSnapshot({ "routes/users.js": `db.execute("DELETE FROM posts WHERE id = " + req.params.id);` }));
    expect(result.status).toBe("fail");
  });

  it("fails on $queryRawUnsafe with interpolation, even without SQL keywords", () => {
    expect(findSqlInjection("await prisma.$queryRawUnsafe(`${q}`);")).toEqual([1]);
  });

  it("finds multi-line template queries at the call's line", () => {
    const src = "const x = 1;\nawait knex.raw(`\n  SELECT *\n  FROM users\n  WHERE name = '${name}'\n`);";
    expect(findSqlInjection(src)).toEqual([2]);
  });

  it("fails on Python f-strings and % formatting", () => {
    expect(findSqlInjection('cursor.execute(f"SELECT * FROM users WHERE id = {uid}")')).toEqual([1]);
    expect(findSqlInjection('cursor.execute("SELECT * FROM users WHERE id = %s" % uid)')).toEqual([1]);
  });

  it("skips test files", () => {
    const result = sqlInjection.run(makeSnapshot({ "tests/db.test.ts": "db.query(`SELECT * FROM t WHERE id = ${id}`)", "lib/a.ts": "" }));
    expect(result.status).toBe("pass");
  });
});
