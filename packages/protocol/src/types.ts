import type { Composition } from "@herd/composition";

export type SessionPhase = "lobby" | "holding" | "live" | "ended";
export type ParticipantConnection = "connected" | "disconnected";
export type AudioStatus = "locked" | "unlocked" | "failed";
export type AssetStatus = "unknown" | "loaded" | "failed";
export type VisibilityStatus = "visible" | "hidden";
export type ReadinessStatus = "ready" | "degraded" | "blocked";
export type PermissionStatus = "unknown" | "granted" | "denied" | "notRequired";
export type PositioningStatus = "notRequired" | "calibrating" | "fresh" | "stale" | "unlocated" | "disabled" | "failedScan";

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
  wakeLock?: boolean;
  reducedMotion?: boolean;
  degradedReasons: string[];
}

export interface PermissionProfile {
  microphone: PermissionStatus;
  motion: PermissionStatus;
}

export interface BatteryProfile {
  level: number;
  charging: boolean;
}

export interface ProgramCursor {
  programId: string;
  programStartTimeMs?: number;
  patternPosition?: number;
  loopCount?: number;
  queuedProgramId?: string;
  progressionPolicy?: "independent" | "lockstep" | "boundedCatchUp" | "forced";
}

export interface VoiceAssignmentSnapshot {
  voiceId: string;
  state: "assigned" | "pendingBoundary" | "fallbackVoice" | "hostAssigned";
  queuedVoiceId?: string;
}

export interface PositioningSnapshot {
  status: PositioningStatus;
  scanId?: string;
  x?: number;
  y?: number;
  confidence?: number;
  updatedAt?: number;
}

export interface ParticipantReport {
  audio: AudioStatus;
  assetStatus: AssetStatus;
  visibility: VisibilityStatus;
  clock: ClockQuality | null;
  capability: CapabilityProfile;
  permissions?: PermissionProfile;
  battery?: BatteryProfile;
  positioning?: PositioningSnapshot;
  programCursor?: ProgramCursor;
  voiceAssignment?: VoiceAssignmentSnapshot;
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

export interface HostOverride {
  id: string;
  type: "stop" | "forceHolding" | "disablePositioning" | "disableShaker" | "forceProgram";
  hostUserId?: string;
  targetProgramId?: string;
  participantIds?: string[];
  createdAt: number;
}

export interface ScanSchedule {
  scanId: string;
  profileId: string;
  serverStartTimeMs: number;
  beaconSlots: Array<{
    beaconDeviceId: string;
    code: string;
    startOffsetMs: number;
    durationMs: number;
  }>;
  guardMs: number;
}

export interface PositioningMeasurement {
  scanId: string;
  listenerDeviceId: string;
  beaconDeviceId: string;
  detected: boolean;
  arrivalTimeMs: number | null;
  confidence: number;
  snr: number | null;
  peakWidthMs: number | null;
  processingMs: number;
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
  hostOverrides?: HostOverride[];
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
  | { type: "positioningMeasurements"; measurements: PositioningMeasurement[] }
  | { type: "hostStart"; leadTimeMs?: number }
  | { type: "hostStop" }
  | { type: "hostForceHolding" }
  | { type: "hostOverride"; override: Omit<HostOverride, "id" | "createdAt"> };

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
  | { type: "scanSchedule"; schedule: ScanSchedule; serverTimeMs: number }
  | { type: "stopped"; serverTimeMs: number }
  | { type: "holdingForced"; serverTimeMs: number }
  | { type: "error"; message: string };

export interface CreateSessionResponse {
  snapshot: SessionSnapshot;
  hostPath: string;
  participantPath: string;
}
