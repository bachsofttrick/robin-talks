import { app } from "./appDef.js";
import { requireDatabaseUrl } from "./lib/env.js";

requireDatabaseUrl();

export default app;
