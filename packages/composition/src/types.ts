export const COMPOSITION_SCHEMA_VERSION = "0.1.0" as const;

export type CompositionSchemaVersion = typeof COMPOSITION_SCHEMA_VERSION;

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
}

export interface VisualizerDevice {
  id: string;
  type: "colorWash" | "shapeBurst";
  defaults: ParameterBag;
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
