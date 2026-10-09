import { describe, expect, it } from "vitest";
import { dangerousCode } from "@/lib/engine/checks/dangerous-code";
import { makeSnapshot } from "../helpers";

describe("dangerous-code", () => {
  it("passes on safe code and look-alikes", () => {
    const src = [
      "const v = evaluate(expr);",
      "await redis.eval(script, 0);",
      "if (el.innerHTML == '') return;",
      "// never use eval(x) here",
      "const data = JSON.parse(text);",
      '<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />',
      "el.innerHTML = DOMPurify.sanitize(html);",
    ].join("\n");
    const result = dangerousCode.run(makeSnapshot({ "app/page.tsx": src }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("is na with no downloaded source files", () => {
    expect(dangerousCode.run(makeSnapshot({ "app/page.tsx": null })).status).toBe("na");
  });

  it("fails on eval and new Function", () => {
    const result = dangerousCode.run(
      makeSnapshot({ "lib/calc.ts": "const a = eval(input);\nconst f = new Function('x', body);" }),
    );
    expect(result.status).toBe("fail");
    expect(result.files).toEqual([
      { path: "lib/calc.ts", line: 1 },
      { path: "lib/calc.ts", line: 2 },
    ]);
    expect(result.fix).toContain("eval");
  });

  it("warns on raw HTML alone", () => {
    const result = dangerousCode.run(
      makeSnapshot({
        "components/Post.tsx": "<div dangerouslySetInnerHTML={{ __html: post.body }} />",
        "public/app.js": "out.innerHTML = userText;\nout.innerHTML += more;",
      }),
    );
    expect(result.status).toBe("warn");
    expect(result.files).toHaveLength(3);
    expect(result.fix).toContain("DOMPurify");
  });

  it("includes both kinds when eval and raw HTML are present", () => {
    const result = dangerousCode.run(makeSnapshot({ "a.js": "eval(x);\ndocument.body.innerHTML = y;" }));
    expect(result.status).toBe("fail");
    expect(result.files).toHaveLength(2);
    expect(result.summary).toContain("raw HTML");
  });

  it("skips test files", () => {
    expect(dangerousCode.run(makeSnapshot({ "lib/a.test.ts": "eval(x)", "lib/a.ts": "" })).status).toBe("pass");
  });
});
