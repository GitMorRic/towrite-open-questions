import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const obsidianTestStub = new URL("./src/test/obsidian-stub.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");

export default defineConfig({
  plugins: [
    svelte({
      preprocess: vitePreprocess()
    })
  ],
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js"
    },
    outDir: "dist",
    rollupOptions: {
      external: [
        "obsidian",
        "electron",
        "@codemirror/state",
        "@codemirror/view"
      ],
      output: {
        exports: "default",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css" || assetInfo.name === "styles.css") {
            return "styles.css";
          }
          return "[name][extname]";
        }
      }
    },
    sourcemap: false,
    target: "es2022"
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    alias: {
      obsidian: obsidianTestStub
    }
  }
});
