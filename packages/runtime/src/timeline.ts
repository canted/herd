import type {
  ChoicePrompt,
  Composition,
  ParameterBag,
  ParameterLocks,
  ParameterValue,
  Program,
  ProgramVoice,
  StepEvent,
} from "../../composition/src/index";

export type RuntimeTimelineEvent =
  | RuntimeParameterLocksEvent
  | RuntimeInstrumentEvent
  | RuntimeVisualizerEvent
  | RuntimeUIPromptEvent;

export interface RuntimeEventBase {
  timeMs: number;
  programId: string;
  voiceId: string;
  patternId: string;
}

export interface RuntimeStepEventBase extends RuntimeEventBase {
  step: number;
  loop: number;
  stepEvent: StepEvent;
}

export interface RuntimeParameterLocksEvent extends RuntimeStepEventBase {
  type: "parameterLocks";
  locks: ParameterLocks;
}

export interface RuntimeInstrumentEvent extends RuntimeStepEventBase {
  type: "instrument";
  instrumentType: ProgramVoice["instrument"]["type"];
  parameters: ParameterBag;
  durationMs?: number;
}

export interface RuntimeVisualizerEvent extends RuntimeStepEventBase {
  type: "visualizer";
  parameters: ParameterBag;
  durationMs?: number;
}

export interface RuntimeUIPromptEvent extends RuntimeEventBase {
  type: "uiPrompt";
  prompt: ChoicePrompt;
}

export interface BuildRuntimeTimelineOptions {
  programId?: string;
  voiceId?: string;
  startTimeMs?: number;
}

export interface ProgramTimelineSegment {
  programId: string;
  startTimeMs: number;
  durationMs: number;
}

export interface CompositionTimeline {
  segments: ProgramTimelineSegment[];
  events: RuntimeTimelineEvent[];
}

export function buildRuntimeTimeline(
  composition: Composition,
  options: BuildRuntimeTimelineOptions = {},
): RuntimeTimelineEvent[] {
  const startTimeMs = options.startTimeMs ?? 0;
  const program = findProgram(composition, options.programId);
  const events: RuntimeTimelineEvent[] = [];

  for (const voice of program.voices) {
    if (options.voiceId !== undefined && voice.id !== options.voiceId) {
      continue;
    }

    events.push(...buildVoiceTimeline(program, voice, startTimeMs));
  }

  return events.sort(compareRuntimeEvents);
}

export function buildCompositionTimeline(
  composition: Composition,
  startTimeMs = 0,
): CompositionTimeline {
  const events: RuntimeTimelineEvent[] = [];
  const segments: ProgramTimelineSegment[] = [];
  let cursorMs = startTimeMs;

  for (const step of composition.programSequencer.steps) {
    const program = findProgram(composition, step.programId);
    const programEvents = buildRuntimeTimeline(composition, {
      programId: program.id,
      startTimeMs: cursorMs,
    });
    const durationMs = getProgramDurationMs(program);

    segments.push({
      programId: program.id,
      startTimeMs: cursorMs,
      durationMs,
    });
    events.push(...programEvents);
    cursorMs += durationMs;
  }

  return {
    segments,
    events: events.sort(compareRuntimeEvents),
  };
}

export function skipStaleEvents<T extends RuntimeTimelineEvent>(
  events: readonly T[],
  currentTransportMs: number,
  allowedLateMs = 0,
): T[] {
  const threshold = currentTransportMs - allowedLateMs;
  return events.filter((event) => event.timeMs >= threshold);
}

export function applyParameterLocks(
  defaults: ParameterBag,
  locks: ParameterBag | undefined,
): ParameterBag {
  const result = cloneParameterBag(defaults);

  if (locks === undefined) {
    return result;
  }

  for (const [key, value] of Object.entries(locks)) {
    if (key.includes(".")) {
      setPath(result, key.split("."), value);
    } else {
      result[key] = cloneParameterValue(value);
    }
  }

  return result;
}

function buildVoiceTimeline(
  program: Program,
  voice: ProgramVoice,
  startTimeMs: number,
): RuntimeTimelineEvent[] {
  const events: RuntimeTimelineEvent[] = [];
  const pattern = voice.pattern;
  const stepMs = (60_000 / pattern.tempoBpm) * pattern.stepDurationBeats;
  const loopMs = stepMs * pattern.stepCount;
  const repetitions = getRepetitions(program, voice);

  if (voice.ui !== undefined) {
    events.push({
      type: "uiPrompt",
      timeMs: startTimeMs,
      programId: program.id,
      voiceId: voice.id,
      patternId: pattern.id,
      prompt: voice.ui.prompt,
    });
  }

  const sortedStepEvents = [...pattern.stepEvents].sort((a, b) => a.step - b.step);

  for (let loop = 0; loop < repetitions; loop += 1) {
    for (const stepEvent of sortedStepEvents) {
      const timeMs = startTimeMs + loop * loopMs + stepEvent.step * stepMs;
      const base = {
        timeMs,
        programId: program.id,
        voiceId: voice.id,
        patternId: pattern.id,
        step: stepEvent.step,
        loop,
        stepEvent,
      };

      if (hasLocks(stepEvent.parameterLocks)) {
        events.push({
          ...base,
          type: "parameterLocks",
          locks: stepEvent.parameterLocks,
        });
      }

      if (stepEvent.instrumentTrigger?.enabled === true) {
        const instrumentEvent: RuntimeInstrumentEvent = {
          ...base,
          type: "instrument",
          instrumentType: voice.instrument.type,
          parameters: applyParameterLocks(voice.instrument.defaults, stepEvent.parameterLocks?.instrument),
        };

        if (stepEvent.instrumentTrigger.durationMs !== undefined) {
          instrumentEvent.durationMs = stepEvent.instrumentTrigger.durationMs;
        }

        events.push(instrumentEvent);
      }

      if (stepEvent.visualizerTrigger?.enabled === true) {
        const visualizerEvent: RuntimeVisualizerEvent = {
          ...base,
          type: "visualizer",
          parameters: applyParameterLocks(voice.visualizer.defaults, stepEvent.parameterLocks?.visualizer),
        };

        if (stepEvent.visualizerTrigger.durationMs !== undefined) {
          visualizerEvent.durationMs = stepEvent.visualizerTrigger.durationMs;
        }

        events.push(visualizerEvent);
      }
    }
  }

  return events;
}

function findProgram(composition: Composition, requestedProgramId: string | undefined): Program {
  const programId = requestedProgramId ?? composition.programSequencer.initialProgramId;
  const program = composition.programs.find((candidate) => candidate.id === programId);

  if (program === undefined) {
    throw new Error(`Program "${programId}" is not defined in Composition "${composition.id}".`);
  }

  return program;
}

function getRepetitions(program: Program, voice: ProgramVoice): number {
  if (
    program.completion.type === "patternRepetitions" &&
    program.completion.sourceVoiceId === voice.id
  ) {
    return program.completion.repetitions;
  }

  return voice.pattern.repetitions ?? 1;
}

function getProgramDurationMs(program: Program): number {
  return Math.max(
    ...program.voices.map((voice) => {
      const stepMs = (60_000 / voice.pattern.tempoBpm) * voice.pattern.stepDurationBeats;
      const loopMs = stepMs * voice.pattern.stepCount;
      return loopMs * getRepetitions(program, voice);
    }),
  );
}

function hasLocks(locks: ParameterLocks | undefined): locks is ParameterLocks {
  return hasOwnValues(locks?.instrument) || hasOwnValues(locks?.visualizer);
}

function hasOwnValues(value: ParameterBag | undefined): value is ParameterBag {
  return value !== undefined && Object.keys(value).length > 0;
}

function compareRuntimeEvents(a: RuntimeTimelineEvent, b: RuntimeTimelineEvent): number {
  if (a.timeMs !== b.timeMs) {
    return a.timeMs - b.timeMs;
  }

  return eventPriority(a.type) - eventPriority(b.type);
}

function eventPriority(type: RuntimeTimelineEvent["type"]): number {
  switch (type) {
    case "uiPrompt":
      return 0;
    case "parameterLocks":
      return 1;
    case "instrument":
      return 2;
    case "visualizer":
      return 3;
  }
}

function setPath(target: ParameterBag, path: string[], value: ParameterValue): void {
  let current: ParameterBag = target;

  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (segment === undefined || segment.length === 0) {
      continue;
    }

    if (index === path.length - 1) {
      current[segment] = cloneParameterValue(value);
      return;
    }

    const next = current[segment];
    if (!isParameterBag(next)) {
      current[segment] = {};
    }

    current = current[segment] as ParameterBag;
  }
}

function cloneParameterBag(value: ParameterBag): ParameterBag {
  const output: ParameterBag = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = cloneParameterValue(nestedValue);
  }
  return output;
}

function cloneParameterValue(value: ParameterValue): ParameterValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneParameterValue(item));
  }

  if (isParameterBag(value)) {
    return cloneParameterBag(value);
  }

  return value;
}

function isParameterBag(value: ParameterValue | undefined): value is ParameterBag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
