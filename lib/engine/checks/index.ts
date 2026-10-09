import type { Check } from "../types";
import { envFiles } from "./env-files";

export const checks: Check[] = [envFiles];
