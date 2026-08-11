import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig, globalIgnores } from "eslint/config";

const recommended = obsidianmd.configs.recommended;
const pluginRegistration = recommended[1];
const typescriptParser = recommended[7];
const obsidianTypescriptRules = recommended[11];

// The community review bot treats Obsidian guideline violations separately
// from a project's own TypeScript style rules. Keep the same separation here:
// `tsc` owns type safety, while this gate owns blocking Obsidian API/UI rules.
// This avoids hiding a real marketplace blocker in hundreds of unrelated
// legacy style findings from typescript-eslint's strict preset.
const marketplaceRules = Object.fromEntries(
  Object.entries(obsidianTypescriptRules.rules ?? {}).filter(([ruleName]) =>
    ruleName.startsWith("obsidianmd/")
  )
);

export default defineConfig(
  globalIgnores([
    "node_modules",
    "dist",
    "main.js",
    "coverage",
    "examples",
    "release",
    "release-assets",
    "scripts",
    "site",
    "**/*.test.ts",
    "**/*.test.tsx"
  ]),
  pluginRegistration,
  typescriptParser,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: marketplaceRules
  }
);
