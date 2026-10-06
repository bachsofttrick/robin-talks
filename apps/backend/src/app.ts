import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.js";
import { dataRouter } from "./data/router.js";
import { trustedOrigins } from "./env.js";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/api/auth/*", cors({ origin: trustedOrigins(), credentials: true }));

  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

  app.route("/api/data", dataRouter);

  return app;
}

export const app = createApp();
