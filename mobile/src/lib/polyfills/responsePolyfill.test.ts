import "./responsePolyfill";

type JsonStatic = { json: (data: unknown, init?: ResponseInit) => Response };

function json(data: unknown, init?: ResponseInit): Response {
  return (Response as unknown as JsonStatic).json(data, init);
}

describe("responsePolyfill", () => {
  test("Response.json exists after the polyfill", () => {
    expect(typeof (Response as unknown as JsonStatic).json).toBe("function");
  });

  test("builds a JSON response with the given status", async () => {
    const res = json({ hello: "world" }, { status: 201 });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual({ hello: "world" });
  });

  test("defaults to status 200", async () => {
    const res = json(null);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toBeNull();
  });
});
