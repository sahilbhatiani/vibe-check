export type Category = "security" | "reliability" | "maintainability";

export type Status = "pass" | "warn" | "fail" | "na";

export type Grade = "A" | "B" | "C" | "D" | "F";

/** One file in the scanned repo. `content` is only present for files we downloaded. */
export interface RepoFile {
  path: string;
  size: number;
  content?: string;
}

export interface RepoMeta {
  /** "owner/name" */
  repo: string;
  defaultBranch: string;
  language: string | null;
  /** True when the repo had more candidate files than we downloaded. */
  sampled: boolean;
}

export interface RepoSnapshot {
  files: RepoFile[];
  meta: RepoMeta;
}

/** A place in the repo that a finding points at. Never holds a raw secret. */
export interface FileRef {
  path: string;
  line?: number;
  /** Short masked excerpt, e.g. from `maskSecret()`. */
  preview?: string;
}

/** What a check's `run()` returns. The engine adds id, category, title and weight. */
export interface CheckOutcome {
  status: Status;
  /** One line, plain English. */
  summary: string;
  files: FileRef[];
  /** What the risk is and what to do, for a non-technical reader. Empty on pass/na. */
  fix: string;
}

export interface CheckResult extends CheckOutcome {
  id: string;
  category: Category;
  title: string;
  weight: number;
}

export interface Check {
  id: string;
  category: Category;
  title: string;
  weight: number;
  run(snapshot: RepoSnapshot): CheckOutcome;
}

export interface Report {
  repo: string;
  /** Number of files whose contents were downloaded and checked. */
  scannedFiles: number;
  sampled: boolean;
  score: number;
  grade: Grade;
  /** True when a failed security check pulled the grade down to C. */
  cappedBySecurity: boolean;
  checks: CheckResult[];
  summary?: string;
}
