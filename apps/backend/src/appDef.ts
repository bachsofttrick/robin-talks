import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth.js";
import { dataRouter } from "./routes/data/index.js";
import { aiRouter } from "./routes/ai/index.js";
import { legalRouter } from "./routes/legal/index.js";
import { trustedOrigins } from "./lib/env.js";

export function createApp() {
  const app = new Hono();

  // Measure CPU time in development
  if (process.env.NODE_ENV !== 'production') {
    app.use("*", async (c, next) => {
      const start = performance.now();
      await next();
      const cpuTime = performance.now() - start;
      console.log(`${c.req.method} ${c.req.path} - CPU time: ${cpuTime.toFixed(4)}ms`);
    });
  }

  app.get("/health", (c) => c.json({ status: "ok" }));
  
  app.route("/legal", legalRouter);

  app.use("/api/*", cors({ origin: trustedOrigins(), credentials: true }));

  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

  app.route("/api/data", dataRouter);

  app.route("/api/ai", aiRouter);

  return app;
}

export const app = createApp();
