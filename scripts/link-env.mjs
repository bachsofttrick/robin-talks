import {
  existsSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

const WORKSPACES = ["apps/mobile", "apps/backend"];
const ROOT_ENV = ".env";
// Bun and Expo each resolve dotenv files against the workspace directory they
// run in, so every workspace links back to the single root file.
const RELATIVE_TARGET = join("..", "..", ROOT_ENV);

function linkWorkspace(workspace) {
  const linkPath = join(workspace, ROOT_ENV);
  const existing = lstatSync(linkPath, { throwIfNoEntry: false });

  if (existing?.isSymbolicLink() && readlinkSync(linkPath) === RELATIVE_TARGET) {
    return false;
  }

  if (existing) {
    unlinkSync(linkPath);
  }

  symlinkSync(RELATIVE_TARGET, linkPath);
  return true;
}

if (!existsSync(ROOT_ENV)) {
  console.log(`No ${ROOT_ENV} at the repository root, so nothing to link.`);
  process.exit(0);
}

for (const workspace of WORKSPACES) {
  if (linkWorkspace(workspace)) {
    console.log(`Linked ${workspace}/${ROOT_ENV} -> ${RELATIVE_TARGET}`);
  }
}