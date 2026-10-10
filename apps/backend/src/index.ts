import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth.js";
import { dataRouter } from "./routes/data/index.js";
import { aiRouter } from "./routes/ai/index.js";
import { trustedOrigins } from "./lib/env.js";
import { requireDatabaseUrl } from "./lib/env.js";

requireDatabaseUrl();

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.use("/api/*", cors({ origin: trustedOrigins(), credentials: true }));

app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/data", dataRouter);

app.route("/api/ai", aiRouter);

export default app;
