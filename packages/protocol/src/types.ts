import type { Composition } from "@herd/composition";

export type SessionPhase = "lobby" | "holding" | "live" | "ended";
export type ParticipantConnection = "connected" | "disconnected";
export type AudioStatus = "locked" | "unlocked" | "failed";
export type AssetStatus = "unknown" | "loaded" | "failed";
export type VisibilityStatus = "visible" | "hidden";
export type ReadinessStatus = "ready" | "degraded" | "blocked";

export interface ClockQuality {
  offsetMs: number;
  rttMs: number;
  jitterMs: number;
  confidence: number;
  lastSyncAt: number;
}

export interface CapabilityProfile {
  webAudio: boolean;
  sampleRate?: number;
  audioWorklet?: boolean;
  wasm?: boolean;
  degradedReasons: string[];
}

export interface ParticipantReport {
  audio: AudioStatus;
  assetStatus: AssetStatus;
  visibility: VisibilityStatus;
  clock: ClockQuality | null;
  capability: CapabilityProfile;
  programId?: string;
  voiceId?: string;
}

export interface ParticipantSnapshot extends ParticipantReport {
  id: string;
  label: string;
  connection: ParticipantConnection;
  joinedAt: number;
  lastSeenAt: number;
}

export interface ChoiceSnapshot {
  promptId: string;
  choiceId: string;
  count: number;
}

export interface EventLogEntry {
  id: string;
  at: number;
  level: "info" | "warning" | "error";
  message: string;
}

export interface ReadinessSummary {
  status: ReadinessStatus;
  readyCount: number;
  degradedCount: number;
  blockedCount: number;
  connectedCount: number;
  topBlockers: string[];
  audienceImpact: string[];
  recommendedAction: string;
}

export interface SessionSnapshot {
  id: string;
  code: string;
  name: string;
  phase: SessionPhase;
  fixtureId: string;
  createdAt: number;
  serverTimeMs: number;
  transportStartTimeMs?: number;
  participants: ParticipantSnapshot[];
  choices: ChoiceSnapshot[];
  logs: EventLogEntry[];
  readiness: ReadinessSummary;
}

export interface PublicSessionInfo {
  code: string;
  name: string;
  phase: SessionPhase;
  fixtureId: string;
}

export type ClientRole = "host" | "participant";

export type ClientToServerMessage =
  | { type: "clockPing"; id: string; clientSentAt: number }
  | { type: "participantReport"; report: ParticipantReport }
  | { type: "participantChoice"; promptId: string; choiceId: string }
  | { type: "hostStart"; leadTimeMs?: number }
  | { type: "hostStop" }
  | { type: "hostForceHolding" };

export type ServerToClientMessage =
  | { type: "snapshot"; snapshot: SessionSnapshot }
  | { type: "fixture"; composition: Composition }
  | {
      type: "clockPong";
      id: string;
      clientSentAt: number;
      serverReceivedAt: number;
      serverSentAt: number;
    }
  | { type: "prepareStart"; transportStartTimeMs: number; serverTimeMs: number }
  | { type: "startConfirmed"; transportStartTimeMs: number; serverTimeMs: number }
  | { type: "stopped"; serverTimeMs: number }
  | { type: "holdingForced"; serverTimeMs: number }
  | { type: "error"; message: string };

export interface CreateSessionResponse {
  snapshot: SessionSnapshot;
  hostPath: string;
  participantPath: string;
}
