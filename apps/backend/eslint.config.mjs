// ESLint flat config for the Hono backend.
// Base rules come from @eslint/js plus typescript-eslint recommended; project
// ignores below. Type-aware rules stay off because `bun run typecheck` (tsc) is
// the type gate for this workspace.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/*", "node_modules/*"]),
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
]);