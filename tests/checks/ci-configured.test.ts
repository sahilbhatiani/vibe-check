import { describe, expect, it } from "vitest";
import { ciConfigured, isCiConfig } from "@/lib/engine/checks/ci-configured";
import { makeSnapshot } from "../helpers";

describe("ci-configured", () => {
  it("passes with a GitHub Actions workflow", () => {
    const result = ciConfigured.run(makeSnapshot({ ".github/workflows/ci.yml": null, "index.ts": "" }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("passes with GitLab or CircleCI config", () => {
    expect(ciConfigured.run(makeSnapshot({ ".gitlab-ci.yml": null })).status).toBe("pass");
    expect(ciConfigured.run(makeSnapshot({ ".circleci/config.yml": null })).status).toBe("pass");
  });

  it("fails without any CI config", () => {
    const result = ciConfigured.run(makeSnapshot({ "index.ts": "", ".github/FUNDING.yml": null }));
    expect(result.status).toBe("fail");
    expect(result.fix).not.toBe("");
  });
});

describe("isCiConfig", () => {
  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/deploy.yaml",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    "bitbucket-pipelines.yml",
    "azure-pipelines.yml",
  ])("matches %s", (p) => expect(isCiConfig(p)).toBe(true));

  it.each([".github/workflows/README.md", ".github/dependabot.yml", "docs/.gitlab-ci.yml", "ci.yml"])(
    "doesn't match %s",
    (p) => expect(isCiConfig(p)).toBe(false),
  );
});
