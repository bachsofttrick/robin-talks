import { Hono } from "hono";
import { ACCOUNT_DELETION_HTML, PRIVACY_POLICY_HTML, TERMS_OF_SERVICE_HTML } from "./legal-pages.js";

export const legalRouter = new Hono();

legalRouter.get("/privacy-policy", (c) => c.html(PRIVACY_POLICY_HTML));
legalRouter.get("/terms-of-service", (c) => c.html(TERMS_OF_SERVICE_HTML));
legalRouter.get("/delete-account", (c) => c.html(ACCOUNT_DELETION_HTML));
