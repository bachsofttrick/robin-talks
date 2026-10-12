import "hono";
import { app } from "./appDef.js";
import { port } from "./lib/env.js";

export default {
    ...app,
    port: port(),
    hostname: '0.0.0.0'
};
