import { describe, expect, it } from "vitest";
import { unprotectedRoutes } from "@/lib/engine/checks/unprotected-routes";
import { makeSnapshot } from "../helpers";

const OPEN_POST = "export async function POST(req: Request) {\n  const body = await req.json();\n  await db.insert(posts).values(body);\n}";

describe("unprotected-routes", () => {
  it("passes when write routes check auth", () => {
    const result = unprotectedRoutes.run(
      makeSnapshot({
        "app/api/posts/route.ts": "import { auth } from '@clerk/nextjs/server';\n" + OPEN_POST,
        "pages/api/items.ts": "const session = await getServerSession(req, res);\nif (req.method === 'POST') {}",
      }),
    );
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("passes for read-only routes", () => {
    const result = unprotectedRoutes.run(
      makeSnapshot({ "app/api/posts/route.ts": "export async function GET() { return Response.json(await db.select()); }" }),
    );
    expect(result.status).toBe("pass");
  });

  it("is na when there are no API routes", () => {
    expect(unprotectedRoutes.run(makeSnapshot({ "app/page.tsx": "export default 1" })).status).toBe("na");
  });

  it("warns (never fails) on write routes with no auth reference", () => {
    const result = unprotectedRoutes.run(
      makeSnapshot({
        "app/api/posts/route.ts": OPEN_POST,
        "pages/api/delete.ts": "export default async function h(req, res) {\n  if (req.method === 'DELETE') {}\n}",
        "routes/users.js": "router.post('/users', async (req, res) => { await User.create(req.body); });",
        "app/api/health/route.ts": "export function GET() { return new Response('ok'); }",
      }),
    );
    expect(result.status).toBe("warn");
    expect(result.files).toEqual([
      { path: "app/api/posts/route.ts", line: 1 },
      { path: "pages/api/delete.ts", line: 2 },
      { path: "routes/users.js", line: 1 },
    ]);
    expect(result.fix).not.toBe("");
  });

  it("treats routes as protected when middleware references auth", () => {
    const result = unprotectedRoutes.run(
      makeSnapshot({ "app/api/posts/route.ts": OPEN_POST, "src/middleware.ts": "export default clerkMiddleware();" }),
    );
    expect(result.status).toBe("pass");
  });

  it("still warns when middleware has nothing to do with auth", () => {
    const result = unprotectedRoutes.run(
      makeSnapshot({ "app/api/posts/route.ts": OPEN_POST, "middleware.ts": "export function m(r) { return i18n(r); }" }),
    );
    expect(result.status).toBe("warn");
  });

  it("treats routes as protected with a global Express auth middleware", () => {
    const result = unprotectedRoutes.run(
      makeSnapshot({ "routes/users.js": "router.post('/', (q, s) => {});", "server.js": "app.use(requireAuth);" }),
    );
    expect(result.status).toBe("pass");
  });

  it("doesn't flag webhook routes that verify a signature", () => {
    const result = unprotectedRoutes.run(
      makeSnapshot({ "app/api/stripe/route.ts": "export async function POST(req) {\n const event = stripe.webhooks.constructEvent(body, sig, whsec);\n await db.update(x);\n}" }),
    );
    expect(result.status).toBe("pass");
  });
});
