import { describe, expect, it } from "vitest";
import { inputValidation } from "@/lib/engine/checks/input-validation";
import { makeSnapshot } from "../helpers";

const route = { "app/api/users/route.ts": "export async function POST(req: Request) { return Response.json(await req.json()); }" };

describe("input-validation", () => {
  it("passes when package.json depends on a validation library", () => {
    const result = inputValidation.run(
      makeSnapshot({ ...route, "package.json": JSON.stringify({ dependencies: { next: "16", zod: "^3" } }) }),
    );
    expect(result.status).toBe("pass");
    expect(result.summary).toContain("zod");
    expect(result.fix).toBe("");
  });

  it("passes on a devDependency like @sinclair/typebox", () => {
    const pkg = JSON.stringify({ devDependencies: { "@sinclair/typebox": "^0.32" } });
    expect(inputValidation.run(makeSnapshot({ ...route, "package.json": pkg })).status).toBe("pass");
  });

  it.each([
    'import { z } from "zod";',
    "import * as v from 'valibot'",
    'import { z } from "zod/v4";',
    'const Joi = require("joi");',
    "import { IsEmail } from 'class-validator';",
  ])("passes when source imports a library: %s", (src) => {
    expect(inputValidation.run(makeSnapshot({ ...route, "lib/schema.ts": src })).status).toBe("pass");
  });

  it("passes for Python apps using pydantic", () => {
    const result = inputValidation.run(
      makeSnapshot({ "api/main.py": "from fastapi import FastAPI", "api/models.py": "from pydantic import BaseModel" }),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when routes exist and nothing validates input", () => {
    const result = inputValidation.run(
      makeSnapshot({ ...route, "package.json": JSON.stringify({ dependencies: { next: "16" } }) }),
    );
    expect(result.status).toBe("fail");
    expect(result.fix).not.toBe("");
  });

  it("doesn't match library names inside other words or packages", () => {
    const result = inputValidation.run(
      makeSnapshot({
        ...route,
        "lib/a.ts": 'import x from "zodiac"; import y from "joiner"; const ajvish = "yup";',
        "package.json": JSON.stringify({ dependencies: { "zod-to-json-schema-lite": "1", zodiac: "1" } }),
      }),
    );
    expect(result.status).toBe("fail");
  });

  it("doesn't crash on a broken package.json", () => {
    expect(inputValidation.run(makeSnapshot({ ...route, "package.json": "{ nope" })).status).toBe("fail");
  });

  it("is na without API routes", () => {
    const result = inputValidation.run(makeSnapshot({ "app/page.tsx": "export default 1" }));
    expect(result.status).toBe("na");
    expect(result.fix).toBe("");
  });
});
