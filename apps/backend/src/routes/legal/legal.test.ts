import { describe, expect, test } from "bun:test";
import { app } from "../../appDef.js";

describe("public legal pages", () => {
  test("serves the privacy policy without an account", async () => {
    const response = await app.request("/legal/privacy-policy");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("Robin Talks Privacy Policy");
    expect(html).toContain("OpenRouter.ai");
  });

  test("serves the Terms of Service without an account", async () => {
    const response = await app.request("/legal/terms-of-service");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("Robin Talks Terms of Service");
  });

  test("serves account deletion instructions without an account", async () => {
    const response = await app.request("/legal/delete-account");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("Robin Talks Account Deletion");
    expect(html).toContain('href="mailto:support@lesteuai.com"');
  });
});
