import type { Check } from "../types";
import { envFiles } from "./env-files";
import { hardcodedSecrets } from "./hardcoded-secrets";
import { publicSecrets } from "./public-secrets";
import { gitignoreEnv } from "./gitignore-env";
import { sqlInjection } from "./sql-injection";
import { dangerousCode } from "./dangerous-code";
import { unprotectedRoutes } from "./unprotected-routes";
import { testsExist } from "./tests-exist";
import { testScript } from "./test-script";
import { ciConfigured } from "./ci-configured";
import { errorHandling } from "./error-handling";
import { inputValidation } from "./input-validation";
import { rateLimiting } from "./rate-limiting";
import { lockfile } from "./lockfile";
import { typeSafety } from "./type-safety";
import { giantFiles } from "./giant-files";
import { debugLeftovers } from "./debug-leftovers";
import { readmeDocs } from "./readme-docs";

// Order matches the SPEC.md checks table.
export const checks: Check[] = [
  // Security
  envFiles,
  hardcodedSecrets,
  publicSecrets,
  gitignoreEnv,
  sqlInjection,
  dangerousCode,
  unprotectedRoutes,
  // Reliability
  testsExist,
  testScript,
  ciConfigured,
  errorHandling,
  inputValidation,
  rateLimiting,
  // Maintainability
  lockfile,
  typeSafety,
  giantFiles,
  debugLeftovers,
  readmeDocs,
];
