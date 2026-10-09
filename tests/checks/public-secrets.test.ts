import { describe, expect, it } from "vitest";
import { isExposedSecretName, publicSecrets } from "@/lib/engine/checks/public-secrets";
import { makeSnapshot } from "../helpers";

describe("public-secrets", () => {
  it("passes when only browser-safe keys are public", () => {
    const src = [
      "const url = process.env.NEXT_PUBLIC_SUPABASE_URL;",
      "const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;",
      "const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;",
      "const fb = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;",
      "const clerk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;",
      "const ph = import.meta.env.VITE_POSTHOG_KEY;",
      "const openai = process.env.OPENAI_API_KEY; // server-only, fine",
    ].join("\n");
    const result = publicSecrets.run(makeSnapshot({ "lib/config.ts": src }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("is na with no downloaded source", () => {
    expect(publicSecrets.run(makeSnapshot({ "lib/config.ts": null })).status).toBe("na");
  });

  it("fails on a public server-only provider key and lists file and line", () => {
    const result = publicSecrets.run(
      makeSnapshot({ "app/chat.tsx": "'use client';\nconst key = process.env.NEXT_PUBLIC_OPENAI_API_KEY;" }),
    );
    expect(result.status).toBe("fail");
    expect(result.files).toEqual([{ path: "app/chat.tsx", line: 2, preview: "NEXT_PUBLIC_OPENAI_API_KEY" }]);
    expect(result.summary).toContain("NEXT_PUBLIC_OPENAI_API_KEY");
    expect(result.fix).not.toBe("");
  });

  it("lists each distinct variable once per file, across prefixes and env templates", () => {
    const result = publicSecrets.run(
      makeSnapshot({
        "src/a.ts": "import.meta.env.VITE_STRIPE_SECRET_KEY;\nimport.meta.env.VITE_STRIPE_SECRET_KEY;",
        "src/b.js": "process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY",
        ".env.example": "NEXT_PUBLIC_ANTHROPIC_API_KEY=\nNEXT_PUBLIC_SITE_URL=",
      }),
    );
    expect(result.status).toBe("fail");
    expect(result.files.map((f) => f.preview)).toEqual([
      "VITE_STRIPE_SECRET_KEY",
      "REACT_APP_SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_ANTHROPIC_API_KEY",
    ]);
    expect(result.summary).toContain("3 secret-looking variables");
  });

  it("ignores test files", () => {
    expect(publicSecrets.run(makeSnapshot({ "tests/env.test.ts": "NEXT_PUBLIC_OPENAI_API_KEY" })).status).toBe("na");
  });
});

describe("isExposedSecretName", () => {
  it.each([
    "NEXT_PUBLIC_OPENAI_API_KEY",
    "NEXT_PUBLIC_STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_JWT_SECRET",
    "REACT_APP_PRIVATE_TOKEN",
    "VITE_AWS_ACCESS_KEY_ID",
    "NEXT_PUBLIC_RESEND_API_KEY",
    "EXPO_PUBLIC_GROQ_API_KEY",
  ])("flags %s", (n) => expect(isExposedSecretName(n)).toBe(true));

  it.each([
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_POSTHOG_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "NEXT_PUBLIC_AWS_REGION",
    "VITE_OPENAI_MODEL",
  ])("doesn't flag %s", (n) => expect(isExposedSecretName(n)).toBe(false));
});
