import type { AiAssistantMessage, AiAssistantMode } from "../ai/chat";
import type { ToWriteLanguage } from "../core/settings";

export interface AiAssistantModelOption {
  id: string;
  label: string;
  provider?: string;
}

export interface AiAssistantSkillOption {
  name: string;
  role?: string;
  skillPath: string;
  agentId?: string;
}

export interface AiAssistantAgentOption {
  agentId: string;
  name: string;
  role?: string;
  status?: string;
  category?: string;
  avatar?: string;
  tools?: string[];
}

export interface AiAssistantContextPreview {
  activeFile?: string;
  selection?: string;
  questionSummaries: string[];
  sentFields: string[];
}

export interface AiAssistantCatalog {
  mode: AiAssistantMode;
  models: AiAssistantModelOption[];
  skills: AiAssistantSkillOption[];
  agents: AiAssistantAgentOption[];
  selectedModelId: string;
  selectedSkillPath: string;
  selectedAgentIds: string[];
  context: AiAssistantContextPreview;
  warning?: string;
}

export interface AiAssistantSendRequest {
  message: string;
  modelId: string;
  skillPath: string;
  agentIds: string[];
}

export interface AiAssistantChoiceRequest {
  messageId: string;
  optionId: string;
  modelId: string;
  skillPath: string;
  agentIds: string[];
}

export interface AiAssistantCallbacks {
  loadCatalog(): Promise<AiAssistantCatalog>;
  send(request: AiAssistantSendRequest): Promise<AiAssistantMessage[]>;
  choose(request: AiAssistantChoiceRequest): Promise<AiAssistantMessage[]>;
  clearHistory(): Promise<AiAssistantMessage[]>;
  renderMarkdown(markdown: string, element: HTMLElement, sourcePath: string): Promise<void>;
}

export interface AiAssistantModalProps {
  language: ToWriteLanguage;
  initialMessages: AiAssistantMessage[];
  callbacks: AiAssistantCallbacks;
  onRequestClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
}
