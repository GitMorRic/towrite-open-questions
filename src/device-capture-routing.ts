export const DEVICE_CAPTURE_ROUTING_SCHEMA_VERSION = 1 as const;

export type DeviceCaptureRouteKind = "append_note" | "create_todo" | "agent_request";

export interface DeviceCaptureRoutingInput {
  captureId: string;
  text: string;
  title?: string;
  tags: string[];
  category?: string;
  metadata?: {
    source_file?: string;
    source_block_id?: string;
    input_mode?: string;
  };
}

export interface DeviceCaptureRouteOption {
  kind: DeviceCaptureRouteKind;
  label: string;
  description: string;
  targetLabel: string;
  requiresApproval: true;
}

export interface DeviceCaptureRoutingPreview {
  schemaVersion: typeof DEVICE_CAPTURE_ROUTING_SCHEMA_VERSION;
  captureId: string;
  routes: DeviceCaptureRouteOption[];
}

export interface DeviceCaptureRouteCommitInput extends DeviceCaptureRoutingInput {
  route: Exclude<DeviceCaptureRouteKind, "append_note">;
  idempotencyKey: string;
}

export interface DeviceAgentProposal {
  schemaVersion: typeof DEVICE_CAPTURE_ROUTING_SCHEMA_VERSION;
  runId: string;
  status: "proposed" | "approved" | "executing" | "succeeded" | "failed" | "rejected";
  createdAt: string;
  updatedAt: string;
  sourceCaptureId: string;
  message: string;
  tool: "create_todo";
  arguments: {
    text: string;
    category?: string;
    source?: string;
  };
  riskLevel: 1;
  requiresApproval: true;
  idempotencyKey: string;
  result?: {
    taskId: string;
    sourcePath: string;
  };
  error?: string;
}

export type DeviceCaptureRouteCommitResult =
  | {
      kind: "create_todo";
      taskId: string;
      sourcePath: string;
      idempotent: boolean;
    }
  | {
      kind: "agent_request";
      run: DeviceAgentProposal;
    };

export function buildDeviceCaptureRoutingPreview(
  input: DeviceCaptureRoutingInput,
  options: { taskPoolPath: string; agentAvailable: boolean }
): DeviceCaptureRoutingPreview {
  const sourceLabel = input.metadata?.source_file?.trim() || "推荐的 Markdown 位置";
  const category = input.category?.trim() || "未分类";
  return {
    schemaVersion: DEVICE_CAPTURE_ROUTING_SCHEMA_VERSION,
    captureId: input.captureId,
    routes: [
      {
        kind: "append_note",
        label: "追加到笔记",
        description: "保留为记录，并写入当前推荐的 Markdown 位置。",
        targetLabel: sourceLabel,
        requiresApproval: true
      },
      {
        kind: "create_todo",
        label: "创建待办",
        description: `写入工作池，并保留来源上下文；分类为 ${category}。`,
        targetLabel: options.taskPoolPath,
        requiresApproval: true
      },
      ...(options.agentAvailable ? [{
        kind: "agent_request" as const,
        label: "交给 Agent",
        description: "先生成受控工具提案；再次确认后才由本地 Connector 执行。",
        targetLabel: "本地 Agent 审批队列",
        requiresApproval: true as const
      }] : [])
    ]
  };
}

export function normalizeDeviceAgentProposals(value: unknown): DeviceAgentProposal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): DeviceAgentProposal[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<DeviceAgentProposal>;
    if (candidate.schemaVersion !== DEVICE_CAPTURE_ROUTING_SCHEMA_VERSION
      || typeof candidate.runId !== "string"
      || typeof candidate.sourceCaptureId !== "string"
      || typeof candidate.message !== "string"
      || candidate.tool !== "create_todo"
      || !candidate.arguments
      || typeof candidate.arguments.text !== "string"
      || !isAgentStatus(candidate.status)
      || typeof candidate.idempotencyKey !== "string"
      || typeof candidate.createdAt !== "string"
      || typeof candidate.updatedAt !== "string") return [];
    return [{
      schemaVersion: DEVICE_CAPTURE_ROUTING_SCHEMA_VERSION,
      runId: candidate.runId.slice(0, 100),
      status: candidate.status,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      sourceCaptureId: candidate.sourceCaptureId.slice(0, 100),
      message: candidate.message.slice(0, 10_000),
      tool: "create_todo",
      arguments: {
        text: candidate.arguments.text.slice(0, 2_000),
        category: candidate.arguments.category?.slice(0, 120),
        source: candidate.arguments.source?.slice(0, 500)
      },
      riskLevel: 1,
      requiresApproval: true,
      idempotencyKey: candidate.idempotencyKey.slice(0, 160),
      result: candidate.result && typeof candidate.result.taskId === "string" && typeof candidate.result.sourcePath === "string"
        ? { taskId: candidate.result.taskId, sourcePath: candidate.result.sourcePath }
        : undefined,
      error: typeof candidate.error === "string" ? candidate.error.slice(0, 500) : undefined
    }];
  }).slice(-100);
}

function isAgentStatus(value: unknown): value is DeviceAgentProposal["status"] {
  return value === "proposed" || value === "approved" || value === "executing"
    || value === "succeeded" || value === "failed" || value === "rejected";
}
