export const COMPOSITION_SCHEMA_VERSION = "0.2.0" as const;
export const LEGACY_COMPOSITION_SCHEMA_VERSION = "0.1.0" as const;

export type CompositionSchemaVersion =
  | typeof LEGACY_COMPOSITION_SCHEMA_VERSION
  | typeof COMPOSITION_SCHEMA_VERSION;

export type Boundary =
  | "immediate"
  | "nextStep"
  | "nextBeat"
  | "nextBar"
  | "patternLoopEnd"
  | "patternRunEnd"
  | "programEnd";

export type ParameterValue =
  | string
  | number
  | boolean
  | null
  | ParameterValue[]
  | { [key: string]: ParameterValue };

export type ParameterBag = Record<string, ParameterValue>;

export interface Composition {
  schemaVersion: CompositionSchemaVersion;
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
  assets: AssetReference[];
  packageManifest?: PackageManifest;
  capabilities?: CompositionCapabilities;
  fallbacks?: FallbackPolicy[];
  voiceAssignment?: VoiceAssignmentPolicy;
  positioningScanRequests?: PositioningScanRequest[];
  presets?: Record<string, unknown>;
  parameters?: ParameterBag;
  programs: Program[];
  programSequencer: ProgramSequencer;
  defaults?: ParameterBag;
}

export interface AssetReference {
  id: string;
  type: "audio" | "image" | "wavetable" | "other";
  path: string;
  hash?: string;
  durationMs?: number;
  sizeBytes?: number;
  sha256?: string;
}

export interface PackageManifest {
  packageVersion: number;
  createdAt?: string;
  compositionHash?: string;
  assets: Array<{
    assetId: string;
    path: string;
    sizeBytes?: number;
    sha256?: string;
    contentType?: string;
  }>;
}

export interface CompositionCapabilities {
  requiresAudio?: boolean;
  requiresMic?: boolean;
  requiresMotion?: boolean;
  requiresPositioning?: boolean;
  requiresWakeLock?: boolean;
  supportsVisualOnlyFallback?: boolean;
}

export interface FallbackPolicy {
  capability: keyof CompositionCapabilities;
  mode: "visualOnly" | "silent" | "nonSpatial" | "disabled" | "fallbackVoice";
  targetVoiceId?: string;
}

export interface VoiceAssignmentPolicy {
  defaultVoiceId?: string;
  source: "fallbackVoice" | "uiChoice" | "balancedRandom" | "joinOrder" | "position";
  applyBoundary?: Boundary;
}

export interface PositioningScanRequest {
  id: string;
  scanProfile: string;
  applyAt: Boundary;
  expectedDurationBeats?: number;
}

export interface ProgramSequencer {
  mode: "linear";
  initialProgramId: string;
  steps: ProgramSequencerStep[];
  transitionPolicy: {
    defaultBoundary: Boundary;
    lateClientPolicy: "compositionRule" | "joinCurrent" | "waitForNext";
  };
  programSyncPolicy: {
    mode: "independent" | "lockstep";
  };
}

export interface ProgramSequencerStep {
  programId: string;
}

export interface Program {
  id: string;
  name: string;
  voices: ProgramVoice[];
  parameters?: ParameterBag;
  completion: ProgramCompletion;
}

export type ProgramCompletion =
  | {
      type: "patternRepetitions";
      sourceVoiceId: string;
      repetitions: number;
      onComplete: { type: "advance" | "hold" };
    }
  | { type: "forever" }
  | { type: "hostAction" }
  | { type: "uiChoice"; sourceVoiceId: string };

export interface ProgramVoice {
  id: string;
  name: string;
  pattern: StepSequencerPattern;
  instrument: InstrumentDevice;
  visualizer: VisualizerDevice;
  ui?: UIDevice;
  parameters?: ParameterBag;
}

export interface StepSequencerPattern {
  id: string;
  type: "stepSequencer";
  stepCount: number;
  tempoBpm: number;
  stepDurationBeats: number;
  repetitions?: number;
  stepEvents: StepEvent[];
  shaker?: ShakerPatternSettings;
}

export interface ShakerPatternSettings {
  motionSensitivity: number;
  quantization: number;
  fallbackMode: "silent" | "visualOnly" | "stepSequencer";
}

export interface StepEvent {
  step: number;
  instrumentTrigger?: InstrumentTrigger;
  visualizerTrigger?: VisualizerTrigger;
  parameterLocks?: ParameterLocks;
}

export interface InstrumentTrigger {
  enabled: boolean;
  durationMs?: number;
}

export interface VisualizerTrigger {
  enabled: boolean;
  durationMs?: number;
}

export interface ParameterLocks {
  instrument?: ParameterBag;
  visualizer?: ParameterBag;
}

export interface InstrumentDevice {
  id: string;
  type: "sampler" | "polySh101";
  defaults: ParameterBag;
  samplerZones?: SamplerZone[];
  modulationRoutes?: ModulationRoute[];
}

export interface VisualizerDevice {
  id: string;
  type: "colorWash" | "shapeBurst";
  defaults: ParameterBag;
  modulationRoutes?: ModulationRoute[];
}

export interface SamplerZone {
  id: string;
  assetId: string;
  pitchLow: string;
  pitchHigh: string;
  velocityLow: number;
  velocityHigh: number;
  rootKey: string;
  gainDb: number;
  startMs: number;
  endMs: number;
  loop: boolean;
}

export interface ModulationRoute {
  source: string;
  target: string;
  amount: number;
  mode?: "add" | "replace" | "multiply";
  range?: {
    min: number;
    max: number;
  };
  applyAt?: Boundary;
  enabled?: boolean;
}

export interface UIDevice {
  id: string;
  type: "choicePrompt";
  prompt: ChoicePrompt;
}

export interface ChoicePrompt {
  id: string;
  text: string;
  choices: ChoiceOption[];
  applyBoundary: Boundary;
}

export interface ChoiceOption {
  id: string;
  label: string;
  targetProgramId?: string;
}
