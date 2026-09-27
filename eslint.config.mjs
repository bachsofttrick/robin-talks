// ESLint flat config for this Expo project.
// Base rules come from eslint-config-expo (Expo SDK 57); project ignores below.
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    // Build output plus Borel-managed/generated sources. core/ is regenerated
    // by Borel (see AGENTS.md conventions) and the borel-*.js bridges are
    // vendor code, so linting them only reports noise that cannot be fixed here.
    ignores: ["dist/*", ".expo/*", "core/*", "borel-store.js", "borel-systemui.js"],
  },
]);
