import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig, globalIgnores } from "eslint/config";

const recommended = obsidianmd.configs.recommended;

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
    "src/test/**",
    "**/*.test.ts",
    "**/*.test.tsx"
  ]),
  ...recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // These are general presentation/type-style rules, not Obsidian marketplace
      // compatibility checks. UI copy intentionally contains product names, paths,
      // IDs, and Chinese text that cannot be normalized as English sentence case.
      "obsidianmd/ui/sentence-case": "off",
      "@typescript-eslint/no-base-to-string": "off"
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
);
