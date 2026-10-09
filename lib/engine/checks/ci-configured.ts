import type { Check } from "../types";

/** CI config files for the common hosted CI services. */
export function isCiConfig(path: string): boolean {
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)) return true;
  if (/^\.circleci\//.test(path)) return true;
  return [".gitlab-ci.yml", "bitbucket-pipelines.yml", "azure-pipelines.yml"].includes(path);
}

// Works on paths only.
export const ciConfigured: Check = {
  id: "ci-configured",
  category: "reliability",
  title: "CI configured",
  weight: 4,
  run(snapshot) {
    const found = snapshot.files.filter((f) => isCiConfig(f.path));

    if (found.length > 0) {
      return {
        status: "pass",
        summary: "Automated checks (CI) are set up for this repo.",
        files: found.map((f) => ({ path: f.path })),
        fix: "",
      };
    }

    return {
      status: "fail",
      summary: "No automated checks (CI) are set up.",
      files: [],
      fix:
        "Nothing automatically runs your tests or checks the code builds when changes are made, so broken code can go " +
        "straight to your users. Set up a free service like GitHub Actions to run your tests and build on every change, " +
        "and only release changes once it shows green.",
    };
  },
};
