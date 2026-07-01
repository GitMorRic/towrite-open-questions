import { copyFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const distDir = resolve(root, "dist");
const targetDir = "D:\\Software\\obsidian\\vault\\Capture\\.obsidian\\plugins\\towrite-open-questions";
const files = ["manifest.json", "main.js", "styles.css"];

for (const file of files) {
  await stat(resolve(distDir, file));
}

await mkdir(targetDir, { recursive: true });

for (const file of files) {
  await copyFile(resolve(distDir, file), resolve(targetDir, file));
}

console.log(`Deployed towrite-open-questions to ${targetDir}`);
