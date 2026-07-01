import { copyFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const distDir = resolve(root, "dist");

await mkdir(distDir, { recursive: true });
await copyFile(resolve(root, "manifest.json"), resolve(distDir, "manifest.json"));

try {
  await stat(resolve(distDir, "styles.css"));
} catch {
  await copyFile(resolve(root, "src", "styles.css"), resolve(distDir, "styles.css"));
}

console.log("Copied manifest.json and ensured styles.css in dist/.");
