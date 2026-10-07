import { app } from "./app.js";
import { port, requireDatabaseUrl } from "./env.js";

export default app;

if (import.meta.main) {
  requireDatabaseUrl();
  Bun.serve({ port: port(), fetch: app.fetch });
}
