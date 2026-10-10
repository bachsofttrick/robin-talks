import { app } from "./app.js";
import { requireDatabaseUrl } from "./lib/env.js";

requireDatabaseUrl();

// const exportApp = {
//   ...app,
//   port: port(),
//   hostname: '0.0.0.0'
// };

export default app;
