/** Pure GitHub repo URL parsing, safe to use in the browser as well as on the server. */

export interface RepoRef {
  owner: string;
  repo: string;
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Accepts `https://github.com/owner/repo` and the usual variants: no scheme, `www.`, a `.git`
 * suffix, trailing slashes, extra path like `/tree/branch`, query strings, SSH remotes
 * (`git@github.com:owner/repo.git`) and the `owner/repo` shorthand. Returns null for anything else.
 */
export function parseRepoUrl(input: string): RepoRef | null {
  let s = input.trim();
  if (s === "" || s.length > 500) return null;

  let path: string;
  const ssh = /^git@github\.com:(.+)$/i.exec(s);
  if (ssh) {
    path = ssh[1];
  } else {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
      s = /^(www\.)?github\.com\//i.test(s) ? `https://${s}` : `https://github.com/${s}`;
    }
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
    if (url.username || url.password || url.port) return null;
    path = url.pathname;
  }

  const [owner, rawRepo] = path.split("/").filter(Boolean);
  if (!owner || !rawRepo) return null;
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}
