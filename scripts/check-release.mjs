import { readFile, stat } from "node:fs/promises";

const [pkg, manifest, versions] = await Promise.all([
  readJson("package.json"),
  readJson("manifest.json"),
  readJson("versions.json")
]);
const errors = [];
if (pkg.version !== manifest.version) {
  errors.push(`package.json (${pkg.version}) and manifest.json (${manifest.version}) versions differ`);
}
if (!versions[manifest.version]) errors.push(`versions.json is missing ${manifest.version}`);
if (versions[manifest.version] !== manifest.minAppVersion) {
  errors.push(`versions.json requires ${versions[manifest.version]}, manifest requires ${manifest.minAppVersion}`);
}
if (manifest.isDesktopOnly !== true) errors.push("manifest must keep isDesktopOnly: true");

for (const asset of ["dist/main.js", "dist/manifest.json", "dist/styles.css"]) {
  try {
    const info = await stat(asset);
    if (asset.endsWith("main.js") && info.size > 2 * 1024 * 1024) {
      errors.push(`dist/main.js is ${(info.size / 1024 / 1024).toFixed(2)} MiB; limit is 2 MiB`);
    }
  } catch {
    errors.push(`${asset} is missing`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Release checks passed for ${manifest.version}.`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
