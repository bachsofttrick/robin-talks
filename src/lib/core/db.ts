// Managed by Borel. This file is generated and kept in sync automatically.
// Editing it by hand will be overwritten the next time your backend changes.
//
// Your app's own cloud: a Postgres database, sign-in, file storage and AI, all
// reached through this app's own address on Borel. Nothing in this file is a
// secret and there is no server anywhere in it: Borel forwards each call to the
// cloud with the right credentials, so the same code works on a phone and in
// the in-browser preview. Every row you can read or write is still decided by
// your tables' row-level security policies, using the signed-in user's own token.
// Implementation lives in ./db/ submodules; this file is the public barrel.
import { client, native, brokerAuth } from "./db/auth";
import { storage, account } from "./db/storage";
import { ai } from "./db/ai";
import { moderation } from "./db/moderation";
import { notify } from "./db/notify";
import { IN_BROWSER } from "./db/config";

export * from "./db/config";
export * from "./db/errors";
export * from "./db/consent";
export * from "./db/auth";
export * from "./db/storage";
export * from "./db/ai";
export * from "./db/moderation";
export * from "./db/notify";

/** The client: db.from("table").select(), db.auth, db.storage, db.ai, db.account, db.moderation, db.notify. Show plainError(error, "save" | "load") for a db.from failure. */
export const db = Object.assign(client, { auth: IN_BROWSER ? brokerAuth : native().auth, storage, ai, account, moderation, notify });
