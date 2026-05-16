import {
  COMPOSITION_SCHEMA_VERSION,
  validateComposition,
  type Composition,
  type InstrumentDevice,
  type ParameterBag,
  type ParameterLocks,
  type ParameterValue,
  type Program,
  type ProgramVoice,
  type StepEvent,
  type VisualizerDevice,
} from "@herd/composition";
import rehearsalBasic from "../../../packages/composition/fixtures/rehearsal-basic.json";

export type LockScope = "instrument" | "visualizer";
export type DeviceScope = LockScope;

export interface ValidationSummary {
  errors: string[];
  warnings: string[];
}

export interface ModulationRoute {
  device: DeviceScope;
  modulator: number;
  source: string;
  target: string;
  amount: number;
  range?: {
    min: number;
    max: number;
  };
  enabled?: boolean;
}

export function seedCompositions(): Composition[] {
  return [
    {
      ...(rehearsalBasic as Composition),
      id: "composition-rehearsal-basic",
      name: "Rehearsal Basic",
    },
  ];
}

export function createBlankComposition(): Composition {
  return {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    id: createId("composition"),
    name: "Untitled Composition",
    metadata: {},
    assets: [],
    presets: {},
    parameters: {},
    programSequencer: {
      mode: "linear",
      initialProgramId: "",
      steps: [],
      transitionPolicy: {
        defaultBoundary: "patternLoopEnd",
        lateClientPolicy: "compositionRule",
      },
      programSyncPolicy: {
        mode: "independent",
      },
    },
    programs: [],
    defaults: {},
  };
}

export function duplicateComposition(composition: Composition): Composition {
  const duplicate = cloneComposition(composition);
  duplicate.id = createId("composition");
  duplicate.name = `${composition.name} Copy`;
  return duplicate;
}

export function cloneComposition(composition: Composition): Composition {
  return JSON.parse(JSON.stringify(composition)) as Composition;
}

export function validateAuthoringComposition(composition: Composition): ValidationSummary {
  const result = validateComposition(composition);
  const errors = result.ok
    ? []
    : result.issues.map((issue) => `${issue.path}: ${issue.message}`);
  const warnings: string[] = [];

  if (composition.assets.length === 0) {
    warnings.push("No assets are referenced yet.");
  }

  for (const program of composition.programs) {
    if (program.voices.length === 0) {
      warnings.push(`${program.name} has no Voices.`);
    }

    for (const voice of program.voices) {
      if (voice.pattern.stepEvents.length === 0) {
        warnings.push(`${voice.name} has no Step Events.`);
      }
      if (voice.ui === undefined) {
        warnings.push(`${voice.name} has no UI Device.`);
      }
    }
  }

  return { errors, warnings };
}

export function createProgram(id = createId("program"), voiceId = createId("voice"), name = "New Program"): Program {
  return {
    id,
    name,
    voices: [createVoice(voiceId)],
    parameters: {},
    completion: {
      type: "patternRepetitions",
      sourceVoiceId: voiceId,
      repetitions: 4,
      onComplete: { type: "advance" },
    },
  };
}

export function createVoice(id = createId("voice")): ProgramVoice {
  return {
    id,
    name: "New Voice",
    pattern: {
      id: createId("pattern"),
      type: "stepSequencer",
      stepCount: 16,
      tempoBpm: 120,
      stepDurationBeats: 0.25,
      stepEvents: [],
    },
    instrument: createInstrument(),
    visualizer: createVisualizer(),
    parameters: {
      modulationRoutes: [],
    },
  };
}

export function createInstrument(): InstrumentDevice {
  return {
    id: createId("instrument"),
    type: "polySh101",
    defaults: {
      pitch: "C3",
      velocity: 84,
      durationMs: 180,
      tune: 0,
      volume: 0.72,
      portamento: 0,
      portamentoMode: "off",
      transpose: "middle",
      oscillator: {
        saw: true,
        pulse: true,
        sub: true,
        sawLevel: 0.75,
        pulseLevel: 0.6,
        subLevel: 0.55,
        noise: 0.04,
        pulseWidth: 0.5,
        pulseWidthSource: "manual",
        modulationAmount: 0.1,
        range: "8",
        subMode: "oneOctSquare",
      },
      filter: {
        cutoff: 0.42,
        resonance: 0.2,
        envelopeAmount: 0.35,
        modulationAmount: 0.1,
        keyboardTracking: 0.3,
      },
      lfo: {
        rate: 0.22,
        amount: 0.1,
        waveform: "triangle",
      },
      vca: {
        mode: "envelope",
      },
      envelope: {
        attackMs: 5,
        decayMs: 120,
        sustain: 0.35,
        releaseMs: 90,
        gateMode: "gateTrigger",
      },
      gain: 0.72,
      glide: 0,
    },
  };
}

export function createVisualizer(): VisualizerDevice {
  return {
    id: createId("visualizer"),
    type: "colorWash",
    defaults: {
      hue: 140,
      saturation: 0.62,
      brightness: 0.7,
      shape: "wash",
      intensity: 0.72,
      decayMs: 260,
      placement: "center",
      motion: "pulse",
    },
  };
}

export function getProgram(composition: Composition, programId: string): Program {
  const program = composition.programs.find((candidate) => candidate.id === programId);
  if (program === undefined) {
    throw new Error(`Program "${programId}" not found.`);
  }
  return program;
}

export function getVoice(program: Program, voiceId: string): ProgramVoice {
  const voice = program.voices.find((candidate) => candidate.id === voiceId);
  if (voice === undefined) {
    throw new Error(`Voice "${voiceId}" not found.`);
  }
  return voice;
}

export function findStepEvent(voice: ProgramVoice, step: number): StepEvent | undefined {
  return voice.pattern.stepEvents.find((event) => event.step === step);
}

export function ensureStepEvent(voice: ProgramVoice, step: number): StepEvent {
  const existing = findStepEvent(voice, step);
  if (existing !== undefined) {
    return existing;
  }

  const created: StepEvent = { step, parameterLocks: {} };
  voice.pattern.stepEvents.push(created);
  voice.pattern.stepEvents.sort((a, b) => a.step - b.step);
  return created;
}

export function normalizeStepEventList(voice: ProgramVoice): void {
  voice.pattern.stepEvents = voice.pattern.stepEvents
    .filter((event) => !isEmptyStepEvent(event))
    .sort((a, b) => a.step - b.step);
}

export function isEmptyStepEvent(event: StepEvent): boolean {
  const hasInstrument = event.instrumentTrigger?.enabled === true;
  const hasVisualizer = event.visualizerTrigger?.enabled === true;
  const hasLocks =
    (event.parameterLocks?.instrument !== undefined &&
      Object.keys(event.parameterLocks.instrument).length > 0) ||
    (event.parameterLocks?.visualizer !== undefined &&
      Object.keys(event.parameterLocks.visualizer).length > 0);

  return !hasInstrument && !hasVisualizer && !hasLocks;
}

export function setStepEventLock(
  event: StepEvent,
  scope: LockScope,
  path: string,
  value: ParameterValue,
): void {
  const locks = event.parameterLocks ?? {};
  const scopedLocks = locks[scope] ?? {};
  scopedLocks[path] = value;
  locks[scope] = scopedLocks;
  event.parameterLocks = locks;
}

export function clearStepEventLock(event: StepEvent, scope: LockScope, path: string): void {
  const scopedLocks = event.parameterLocks?.[scope];
  if (scopedLocks === undefined) return;

  delete scopedLocks[path];
  if (Object.keys(scopedLocks).length === 0) {
    delete event.parameterLocks?.[scope];
  }
}

export function getStepLocks(event: StepEvent | undefined): Array<{ scope: LockScope; path: string; value: ParameterValue }> {
  if (event?.parameterLocks === undefined) {
    return [];
  }

  const output: Array<{ scope: LockScope; path: string; value: ParameterValue }> = [];
  for (const scope of ["instrument", "visualizer"] as const) {
    const scopedLocks = event.parameterLocks[scope];
    if (scopedLocks === undefined) continue;
    for (const [path, value] of Object.entries(scopedLocks)) {
      output.push({ scope, path, value });
    }
  }
  return output;
}

export function setNestedParameter(target: ParameterBag, path: string, value: ParameterValue): void {
  const segments = path.split(".");
  let current = target;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) continue;

    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }

    const next = current[segment];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[segment] = {};
    }

    current = current[segment] as ParameterBag;
  }
}

export function getNestedParameter(target: ParameterBag, path: string): ParameterValue | undefined {
  const segments = path.split(".");
  let current: ParameterValue | undefined = target;

  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

export function getModulationRoutes(voice: ProgramVoice): ModulationRoute[] {
  const routes = voice.parameters?.modulationRoutes;
  return Array.isArray(routes) ? (routes as unknown as ModulationRoute[]) : [];
}

export function setModulationRoute(voice: ProgramVoice, route: ModulationRoute): void {
  const routes = getModulationRoutes(voice).filter(
    (candidate) =>
      !(
        candidate.device === route.device &&
        candidate.modulator === route.modulator &&
        candidate.target === route.target
      ),
  );
  routes.push(route);
  voice.parameters = {
    ...(voice.parameters ?? {}),
    modulationRoutes: routes as unknown as ParameterValue,
  };
}

export function updateModulationRoute(
  voice: ProgramVoice,
  route: Pick<ModulationRoute, "device" | "modulator" | "target">,
  patch: Partial<ModulationRoute>,
): void {
  const routes = getModulationRoutes(voice).map((candidate) =>
    candidate.device === route.device &&
      candidate.modulator === route.modulator &&
      candidate.target === route.target
      ? { ...candidate, ...patch }
      : candidate,
  );
  voice.parameters = {
    ...(voice.parameters ?? {}),
    modulationRoutes: routes as unknown as ParameterValue,
  };
}

export function clearModulationRoute(
  voice: ProgramVoice,
  route: Pick<ModulationRoute, "device" | "modulator" | "target">,
): void {
  const routes = getModulationRoutes(voice).filter(
    (candidate) =>
      !(
        candidate.device === route.device &&
        candidate.modulator === route.modulator &&
        candidate.target === route.target
      ),
  );
  voice.parameters = {
    ...(voice.parameters ?? {}),
    modulationRoutes: routes as unknown as ParameterValue,
  };
}

export function clampStepCount(value: number): number {
  return Math.min(64, Math.max(1, Math.round(value)));
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
