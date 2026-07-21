export type InboxItemKind = "vault-note" | "agent-letter" | "human-message" | "device-message";
export type InboxItemSource = "vault-folder" | "agent" | "mailbox" | "device";

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  source: InboxItemSource;
  status: "pending";
  title: string;
  filePath: string;
  sourceRoot: string;
  project: string;
  folder: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InboxGroup {
  id: string;
  label: string;
  items: InboxItem[];
}

export interface InboxDeviceEligibility {
  eligible: boolean;
  reason?: string;
}

export interface InboxSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  sourceRoots: string[];
  groupBy: "project" | "folder";
  count: number;
  visibleCount: number;
  truncated: boolean;
  items: InboxItem[];
  groups: InboxGroup[];
}
