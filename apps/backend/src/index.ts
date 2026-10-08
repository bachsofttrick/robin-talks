import { app } from "./app.js";
import { port, requireDatabaseUrl } from "./lib/env.js";

let exportApp;

if (process.env.NODE_ENV === 'production') {
  requireDatabaseUrl();
  Bun.serve({ port: port(), fetch: app.fetch });
} else {
  exportApp = {...app, hostname: '0.0.0.0'};
}

export default exportApp;
