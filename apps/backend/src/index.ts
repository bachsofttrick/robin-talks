import "hono";
import { app } from "./appDef.js";
import { port, requireDatabaseUrl } from "./lib/env.js";

requireDatabaseUrl();

export default {
    ...app,
    port: port(),
    hostname: '0.0.0.0'
};
