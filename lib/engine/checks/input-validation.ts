import type { Check, RepoFile } from "../types";
import { isApiRoute, isSourceFile } from "../util";

const JS_LIBRARIES = [
  "zod", "yup", "joi", "valibot", "class-validator", "superstruct", "ajv",
  "@sinclair/typebox", "express-validator", "arktype",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// `from "zod"`, `from 'zod/v4'`, `require("joi")`, `import("yup")`, `import "zod"`. Only quoted package names, so
// "zod" inside some other word never matches.
const JS_IMPORT = new RegExp(
  `(?:\\bfrom|\\brequire\\s*\\(|\\bimport\\s*\\(|\\bimport)\\s*["'](?:${JS_LIBRARIES.map(escape).join("|")})(?:/[^"']*)?["']`,
);
const PY_IMPORT = /^\s*(?:from|import)\s+pydantic\b/m;

function dependencyNames(pkg: RepoFile | undefined): string[] {
  if (pkg?.content === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(pkg.content);
    if (parsed === null || typeof parsed !== "object") return [];
    const record = parsed as Record<string, unknown>;
    return ["dependencies", "devDependencies"].flatMap((key) => {
      const deps = record[key];
      return deps !== null && typeof deps === "object" ? Object.keys(deps) : [];
    });
  } catch {
    return [];
  }
}

export const inputValidation: Check = {
  id: "input-validation",
  category: "reliability",
  title: "Input validation",
  weight: 5,
  run(snapshot) {
    if (!snapshot.files.some((f) => isApiRoute(f.path))) {
      return { status: "na", summary: "No API routes were found, so there's no incoming data to check.", files: [], fix: "" };
    }

    const deps = dependencyNames(snapshot.files.find((f) => f.path === "package.json"));
    const depHit = deps.find((d) => JS_LIBRARIES.includes(d));
    if (depHit) {
      return { status: "pass", summary: `Incoming data is checked with ${depHit}.`, files: [], fix: "" };
    }

    const source = snapshot.files.find(
      (f) => f.content !== undefined && isSourceFile(f.path) && (JS_IMPORT.test(f.content) || PY_IMPORT.test(f.content)),
    );
    if (source) {
      return { status: "pass", summary: "A validation library is used to check incoming data.", files: [], fix: "" };
    }

    return {
      status: "fail",
      summary: "The app has API routes but no validation library was found.",
      files: [],
      fix:
        "Your server seems to trust whatever data it's sent. People (or bots) can send missing, oversized or malicious " +
        "values that crash the app or corrupt your data. Ask your developer to check every incoming request against a " +
        "clear set of rules using a validation library such as Zod (JavaScript) or Pydantic (Python), and reject " +
        "anything that doesn't fit.",
    };
  },
};
