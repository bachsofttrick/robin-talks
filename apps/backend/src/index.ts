import "hono";
import { app } from "./appDef.js";
import { requireDatabaseUrl } from "./lib/env.js";
import { serve } from '@hono/node-server';

requireDatabaseUrl();

serve(app)
