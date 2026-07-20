import type { DeviceFeedPage, DeviceProfile } from "../external/device-feed";
import type { OpenQuestionLane, OpenQuestionRule, OpenQuestionStatus } from "../core/types";
import type { DeviceButtonMapping, DeviceInteractionAction, DeviceSourceRef } from "../device-interactions";

export type PushTargetType = "quote0" | "mobile-app" | "local-web" | "webhook";
export type PushPrivacyLevel = "local-coarse" | "precise-location" | "no-location";
export type PushCandidateType = "home-summary" | "question" | "workflow-file" | "article";
export type PushFeedbackAction = "useful" | "skipped" | "later" | "answered" | "opened-no-write" | "opened";

export interface PushPrivacySettings {
  level: PushPrivacyLevel;
  allowPreciseLocation: boolean;
  shareWithAi: boolean;
}

export interface PushTargetSettings {
  id: string;
  name: string;
  type: PushTargetType;
  enabled: boolean;
  profile: DeviceProfile;
  width: number;
  height: number;
  inches: number;
  defaultPage: DeviceFeedPage;
  defaultLane: OpenQuestionLane | "";
  refreshSeconds: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  token: string;
  capabilities: string[];
  buttonMappings?: DeviceButtonMapping[];
}

export interface PushHabitRule {
  id: string;
  label: string;
  enabled: boolean;
  timeStart: string;
  timeEnd: string;
  placeLabel: string;
  mode: string;
  stageIds: string[];
  lanes: OpenQuestionLane[];
  statuses: OpenQuestionStatus[];
  targetIds: string[];
  boost: number;
  limitPerDay: number;
}

export interface ToWritePushSettings {
  enabled: boolean;
  privacy: PushPrivacySettings;
  targets: PushTargetSettings[];
  habits: PushHabitRule[];
  habitText: string;
  aiRerank: boolean;
}

export interface PushContextAnchor {
  id: string;
  source: "manual" | "device" | "system" | "ai";
  targetId?: string;
  deviceId?: string;
  placeLabel?: string;
  mode?: string;
  activeFile?: string;
  networkLabel?: string;
  preciseLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  capturedAt: string;
  expiresAt?: string;
}

export interface PushDeliveryEvent {
  id: string;
  targetId: string;
  candidateId: string;
  candidateType: PushCandidateType;
  decisionReason: string;
  score: number;
  sentAt?: string;
  openedAt?: string;
  respondedAt?: string;
  skippedAt?: string;
  feedback?: PushFeedbackAction;
  note?: string;
  clientId?: string;
}

export interface PushRuntimeState {
  anchors: PushContextAnchor[];
  events: PushDeliveryEvent[];
  targetCursors: Record<string, number>;
  displayCursors: Record<string, number>;
}

export interface PushCandidate {
  id: string;
  type: PushCandidateType;
  title: string;
  body: string;
  note?: string;
  nextAction?: string;
  sourceFile?: string;
  sourceTitle?: string;
  sourceLine?: number;
  sourceEndLine?: number;
  sourceBlockId?: string;
  sourcePage?: number;
  sourceRef?: DeviceSourceRef;
  workflowStageId?: string;
  workflowStageTitle?: string;
  lane?: OpenQuestionLane;
  status?: OpenQuestionStatus;
  tags: string[];
  reminderAt?: string;
  reminderNote?: string;
  reminderDue?: boolean;
  stale?: boolean;
  ageDays?: number;
  oldestOpenAgeDays?: number;
  statusLabel?: string;
  articleOpen?: number;
  articleCandidate?: number;
  articleResolved?: number;
  articleThink?: number;
  articleWrite?: number;
  metrics?: PushDisplayMetric[];
  badges?: string[];
  footer?: string;
  pinned?: boolean;
  updatedAt?: string;
  openUri?: string;
  answerUrl?: string;
  questionId?: string;
  sourceRule?: OpenQuestionRule;
}

export interface PushDisplayMetric {
  label: string;
  value: number | string;
  hint?: string;
}

export interface PushDisplayCard {
  variant: PushCandidateType | "empty";
  icon: string;
  kicker?: string;
  title: string;
  primary: string;
  secondaryLines: string[];
  metrics: PushDisplayMetric[];
  badges: string[];
  footer: string;
  link?: string;
  actions?: DeviceInteractionAction[];
  titleText: string;
  message: string;
  signature: string;
}

export interface PushDecision {
  target: PushTargetSettings;
  candidate?: PushCandidate;
  score: number;
  reason: string;
  quiet: boolean;
  suppressedReason?: string;
  generatedAt: string;
}

export interface PushFeedPayload {
  schemaVersion: 1;
  generatedAt: string;
  target: {
    id: string;
    name: string;
    type: PushTargetType;
    profile: DeviceProfile;
    width: number;
    height: number;
    inches: number;
    capabilities: string[];
  };
  privacy: {
    level: PushPrivacyLevel;
    preciseLocationIncluded: boolean;
  };
  context: {
    timeBucket: string;
    placeLabel?: string;
    mode?: string;
    activeFile?: string;
  };
  decision: {
    candidateId?: string;
    candidateType?: PushCandidateType;
    deliveryId?: string;
    score: number;
    reason: string;
    quiet: boolean;
    suppressedReason?: string;
  };
  display: PushDisplayCard;
  candidate?: PushCandidate;
}
