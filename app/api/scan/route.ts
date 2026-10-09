import { runChecks } from "@/lib/engine";
import { checks } from "@/lib/engine/checks";
import { fetchSnapshot, GitHubError, parseRepoUrl } from "@/lib/github";

export const maxDuration = 60;

function errorResponse(status: number, error: string, resetAt?: Date): Response {
  if (!resetAt) return Response.json({ error }, { status });
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  return Response.json(
    { error, resetAt: resetAt.toISOString() },
    { status, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'Send a JSON body like { "url": "https://github.com/owner/repo" }.');
  }

  const url = typeof body === "object" && body !== null ? (body as { url?: unknown }).url : undefined;
  const ref = typeof url === "string" ? parseRepoUrl(url) : null;
  if (!ref) {
    return errorResponse(400, "That doesn't look like a GitHub repo link. Try something like https://github.com/owner/repo.");
  }

  try {
    const snapshot = await fetchSnapshot(ref);
    return Response.json(runChecks(snapshot, checks));
  } catch (err) {
    if (err instanceof GitHubError) return errorResponse(err.status, err.message, err.resetAt);
    console.error("Scan failed:", err instanceof Error ? err.message : "unknown error");
    return errorResponse(500, "Something went wrong while scanning this repo. Please try again.");
  }
}
