import { normalizePath, type App } from "obsidian";

/** Read plugin-owned data, including dot-prefixed directories hidden from the Vault tree. */
export async function readVaultDataText(app: App, path: string): Promise<string | undefined> {
  const normalized = normalizePath(path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, ""));
  if (!normalized) throw new Error("Vault data path is empty.");
  const stat = await app.vault.adapter.stat(normalized);
  if (!stat) return undefined;
  if (stat.type !== "file") throw new Error(`${normalized} exists and is not a file.`);
  return app.vault.adapter.read(normalized);
}

/** Write plugin-owned, user-readable data that may live in a dot-prefixed directory. */
export async function writeVaultDataText(app: App, path: string, content: string): Promise<void> {
  const normalized = normalizePath(path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, ""));
  if (!normalized) {
    throw new Error("Vault data path is empty.");
  }

  const parts = normalized.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error("Vault data path must include a file name.");
  }

  let directory = "";
  for (const part of parts) {
    directory = directory ? `${directory}/${part}` : part;
    const stat = await app.vault.adapter.stat(directory);
    if (stat) {
      if (stat.type !== "folder") {
        throw new Error(`${directory} already exists and is not a folder.`);
      }
      continue;
    }
    await app.vault.adapter.mkdir(directory);
  }

  const target = await app.vault.adapter.stat(normalized);
  if (target?.type === "folder") {
    throw new Error(`${normalized} already exists and is not a file.`);
  }
  await app.vault.adapter.write(normalized, content);
}
