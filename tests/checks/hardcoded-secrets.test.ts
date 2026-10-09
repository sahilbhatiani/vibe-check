import { describe, expect, it } from "vitest";
import { hardcodedSecrets, isPlaceholder } from "@/lib/engine/checks/hardcoded-secrets";
import { makeSnapshot } from "../helpers";

// Fake keys are assembled from pieces so this file never contains a complete key-shaped string
// (keeps GitHub's secret scanning quiet).
const b64url = (s: string) => btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (payload: object) =>
  [b64url('{"alg":"HS256","typ":"JWT"}'), b64url(JSON.stringify(payload)), "Kd8sQ2pZr7Lm4Xv1Tq9Wb3Yc"].join(".");

const SECRETS = {
  openai: "sk-" + "proj-" + "Ab3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gH",
  anthropic: "sk-" + "ant-api03-" + "Zq8Wn4Lr2Tx6Vb0Mc3Kp7Hs1Dg5Fj9Ay",
  stripe: "sk_" + "live_" + "51HxYzQ2wErT9uIoP3aSdF6gHjK",
  aws: "AKIA" + "QX7RB4MZ2KD9TW3N",
  github: "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8",
  slack: "xoxb-" + "2468013579-1357924680-Qw3Er5Ty7Ui9",
  serviceRole: jwt({ iss: "supabase", ref: "abcdefghij", role: "service_role", iat: 1700000000 }),
};
const KEY_BODY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7" + "Vq9Lm2Xz8Rt4Wy6Pk3Ns1Hd5Jf7Gb0Ca";
const PRIVATE_KEY = `-----BEGIN ${"PRIVATE"} KEY-----`;

describe("hardcoded-secrets", () => {
  it("passes on clean source", () => {
    const result = hardcodedSecrets.run(
      makeSnapshot({ "lib/ai.ts": "const key = process.env.OPENAI_API_KEY;\nexport default key;" }),
    );
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("is na when nothing scannable was downloaded", () => {
    expect(hardcodedSecrets.run(makeSnapshot({ "lib/ai.ts": null, "logo.png": null })).status).toBe("na");
  });

  it.each(Object.entries(SECRETS))("fails on a %s key and never reveals it", (_, secret) => {
    const result = hardcodedSecrets.run(makeSnapshot({ "lib/config.ts": `// setup\nconst k = "${secret}";` }));
    expect(result.status).toBe("fail");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({ path: "lib/config.ts", line: 2 });
    expect(result.files[0].preview).toContain("••••");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(secret.slice(6));
  });

  it("fails on a JWT named as a service role key", () => {
    const anonShapedJwt = jwt({ iss: "supabase", role: "authenticated" });
    const result = hardcodedSecrets.run(makeSnapshot({ "lib/db.ts": `const SUPABASE_SERVICE_ROLE_KEY = "${anonShapedJwt}";` }));
    expect(result.status).toBe("fail");
    expect(JSON.stringify(result)).not.toContain(anonShapedJwt);
  });

  it("doesn't flag a Supabase anon JWT", () => {
    const anon = jwt({ iss: "supabase", role: "anon" });
    expect(hardcodedSecrets.run(makeSnapshot({ "lib/db.ts": `const anonKey = "${anon}";` })).status).toBe("pass");
  });

  it("fails on a private key in a service-account JSON file and never reveals it", () => {
    const json = `{\n  "type": "service_account",\n  "private_key": "${PRIVATE_KEY}\\n${KEY_BODY}\\n-----END PRIVATE KEY-----\\n"\n}`;
    const result = hardcodedSecrets.run(makeSnapshot({ "firebase-admin.json": json }));
    expect(result.status).toBe("fail");
    expect(result.files[0]).toMatchObject({ path: "firebase-admin.json", line: 3, preview: "-----BEGIN…••••" });
    expect(JSON.stringify(result)).not.toContain(KEY_BODY.slice(0, 20));
  });

  it("fails on a multi-line private key in source", () => {
    const src = `const pem = \`${PRIVATE_KEY}\n${KEY_BODY}\n-----END PRIVATE KEY-----\`;`;
    const result = hardcodedSecrets.run(makeSnapshot({ "server/sign.ts": src }));
    expect(result.status).toBe("fail");
    expect(JSON.stringify(result)).not.toContain(KEY_BODY.slice(0, 20));
  });

  it("doesn't flag a bare private key header in parsing code", () => {
    const src = `if (pem.startsWith("${PRIVATE_KEY}")) parse(pem);`;
    expect(hardcodedSecrets.run(makeSnapshot({ "lib/pem.ts": src })).status).toBe("pass");
  });

  it("ignores placeholders and look-alikes", () => {
    const src = [
      'const a = "sk-your-openai-key-goes-here-please";',
      'const b = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";',
      'const c = "AKIAIOSFODNN7EXAMPLE";',
      'const d = "AKIA0000000000000000";',
      'const e = "sk-loading-spinner-container-wrapper";',
      'const f = "sk_' + 'test_51HxYzQ2wErT9uIoP3aSdF6gHjK";',
    ].join("\n");
    expect(hardcodedSecrets.run(makeSnapshot({ "lib/x.ts": src })).status).toBe("pass");
  });

  it("skips test files, env templates and dependencies", () => {
    const line = `const k = "${SECRETS.stripe}";`;
    const result = hardcodedSecrets.run(
      makeSnapshot({
        "tests/payments.test.ts": line,
        ".env.example": `STRIPE_KEY=${SECRETS.stripe}`,
        "node_modules/pkg/index.js": line,
        "README.md": line,
        "lib/ok.ts": "export {}",
      }),
    );
    expect(result.status).toBe("pass");
  });

  it("scans YAML config", () => {
    const result = hardcodedSecrets.run(makeSnapshot({ ".github/workflows/deploy.yml": `env:\n  AWS_KEY: ${SECRETS.aws}` }));
    expect(result.status).toBe("fail");
    expect(result.files[0].line).toBe(2);
  });

  it("counts every finding and caps the file list", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 25; i++) files[`lib/f${i}.ts`] = `const k = "${SECRETS.github}";`;
    const result = hardcodedSecrets.run(makeSnapshot(files));
    expect(result.summary).toContain("25 likely secrets");
    expect(result.files).toHaveLength(20);
  });
});

describe("isPlaceholder", () => {
  it.each(["sk-your-key-here-000000000", "AKIAEXAMPLEEXAMPLE12", "ghp_aaaaaaaaaaaaaaaaaaaa"])("treats %s as a placeholder", (t) =>
    expect(isPlaceholder(t)).toBe(true),
  );
  it("doesn't treat a random-looking key as a placeholder", () => expect(isPlaceholder(SECRETS.openai)).toBe(false));
});
