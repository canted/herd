import {
  COMPOSITION_SCHEMA_VERSION,
  type Composition,
  type StepEvent,
} from "./types";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type CompositionValidationResult =
  | { ok: true; value: Composition; issues: [] }
  | { ok: false; issues: ValidationIssue[] };

export function validateComposition(input: unknown): CompositionValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          code: "composition.notObject",
          message: "Composition must be an object.",
        },
      ],
    };
  }

  expectLiteral(
    input.schemaVersion,
    COMPOSITION_SCHEMA_VERSION,
    "$.schemaVersion",
    "composition.schemaVersion",
    issues,
  );
  expectString(input.id, "$.id", "composition.id", issues);
  expectString(input.name, "$.name", "composition.name", issues);
  expectArray(input.assets, "$.assets", "composition.assets", issues);
  expectArray(input.programs, "$.programs", "composition.programs", issues);
  expectRecord(
    input.programSequencer,
    "$.programSequencer",
    "composition.programSequencer",
    issues,
  );

  if (Array.isArray(input.assets)) {
    validateAssets(input.assets, issues);
  }

  const programIds = new Set<string>();
  const voiceIdsByProgram = new Map<string, Set<string>>();

  if (Array.isArray(input.programs)) {
    input.programs.forEach((program, programIndex) => {
      if (!isRecord(program)) {
        addIssue(
          issues,
          `$.programs[${programIndex}]`,
          "program.notObject",
          "Program must be an object.",
        );
        return;
      }

      const programPath = `$.programs[${programIndex}]`;
      expectString(program.id, `${programPath}.id`, "program.id", issues);
      expectString(program.name, `${programPath}.name`, "program.name", issues);
      expectArray(program.voices, `${programPath}.voices`, "program.voices", issues);
      expectRecord(
        program.completion,
        `${programPath}.completion`,
        "program.completion",
        issues,
      );

      if (typeof program.id === "string") {
        if (programIds.has(program.id)) {
          addIssue(
            issues,
            `${programPath}.id`,
            "program.duplicateId",
            `Program id "${program.id}" must be unique.`,
          );
        }
        programIds.add(program.id);
      }

      const voiceIds = new Set<string>();
      voiceIdsByProgram.set(typeof program.id === "string" ? program.id : programPath, voiceIds);

      if (Array.isArray(program.voices)) {
        program.voices.forEach((voice, voiceIndex) => {
          validateVoice(voice, `${programPath}.voices[${voiceIndex}]`, voiceIds, issues);
        });
      }

      if (isRecord(program.completion)) {
        validateCompletion(program.completion, programPath, voiceIds, issues);
      }
    });
  }

  if (isRecord(input.programSequencer)) {
    validateProgramSequencer(input.programSequencer, programIds, issues);
  }

  const sortedIssues = [...issues].sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    return a.code.localeCompare(b.code);
  });

  if (sortedIssues.length > 0) {
    return { ok: false, issues: sortedIssues };
  }

  return { ok: true, value: input as unknown as Composition, issues: [] };
}

function validateAssets(assets: unknown[], issues: ValidationIssue[]): void {
  const assetIds = new Set<string>();

  assets.forEach((asset, assetIndex) => {
    if (!isRecord(asset)) {
      addIssue(
        issues,
        `$.assets[${assetIndex}]`,
        "asset.notObject",
        "Asset reference must be an object.",
      );
      return;
    }

    const path = `$.assets[${assetIndex}]`;
    expectString(asset.id, `${path}.id`, "asset.id", issues);
    expectOneOf(asset.type, ["audio", "image", "wavetable", "other"], `${path}.type`, "asset.type", issues);
    expectString(asset.path, `${path}.path`, "asset.path", issues);

    if (typeof asset.id === "string") {
      if (assetIds.has(asset.id)) {
        addIssue(issues, `${path}.id`, "asset.duplicateId", `Asset id "${asset.id}" must be unique.`);
      }
      assetIds.add(asset.id);
    }

    if (asset.durationMs !== undefined) {
      expectPositiveNumber(asset.durationMs, `${path}.durationMs`, "asset.durationMs", issues);
    }
  });
}

function validateProgramSequencer(
  sequencer: Record<string, unknown>,
  programIds: Set<string>,
  issues: ValidationIssue[],
): void {
  expectLiteral(sequencer.mode, "linear", "$.programSequencer.mode", "programSequencer.mode", issues);
  expectString(
    sequencer.initialProgramId,
    "$.programSequencer.initialProgramId",
    "programSequencer.initialProgramId",
    issues,
  );
  expectArray(sequencer.steps, "$.programSequencer.steps", "programSequencer.steps", issues);
  expectRecord(
    sequencer.transitionPolicy,
    "$.programSequencer.transitionPolicy",
    "programSequencer.transitionPolicy",
    issues,
  );
  expectRecord(
    sequencer.programSyncPolicy,
    "$.programSequencer.programSyncPolicy",
    "programSequencer.programSyncPolicy",
    issues,
  );

  if (typeof sequencer.initialProgramId === "string" && !programIds.has(sequencer.initialProgramId)) {
    addIssue(
      issues,
      "$.programSequencer.initialProgramId",
      "programSequencer.unknownInitialProgram",
      `Initial program "${sequencer.initialProgramId}" is not defined.`,
    );
  }

  if (Array.isArray(sequencer.steps)) {
    sequencer.steps.forEach((step, stepIndex) => {
      if (!isRecord(step)) {
        addIssue(
          issues,
          `$.programSequencer.steps[${stepIndex}]`,
          "programSequencer.step.notObject",
          "Program sequencer step must be an object.",
        );
        return;
      }

      const stepPath = `$.programSequencer.steps[${stepIndex}]`;
      expectString(step.programId, `${stepPath}.programId`, "programSequencer.step.programId", issues);

      if (typeof step.programId === "string" && !programIds.has(step.programId)) {
        addIssue(
          issues,
          `${stepPath}.programId`,
          "programSequencer.step.unknownProgram",
          `Program "${step.programId}" is not defined.`,
        );
      }
    });
  }

  if (isRecord(sequencer.transitionPolicy)) {
    expectOneOf(
      sequencer.transitionPolicy.defaultBoundary,
      ["immediate", "nextStep", "nextBeat", "nextBar", "patternLoopEnd", "patternRunEnd", "programEnd"],
      "$.programSequencer.transitionPolicy.defaultBoundary",
      "programSequencer.transitionPolicy.defaultBoundary",
      issues,
    );
    expectOneOf(
      sequencer.transitionPolicy.lateClientPolicy,
      ["compositionRule", "joinCurrent", "waitForNext"],
      "$.programSequencer.transitionPolicy.lateClientPolicy",
      "programSequencer.transitionPolicy.lateClientPolicy",
      issues,
    );
  }

  if (isRecord(sequencer.programSyncPolicy)) {
    expectOneOf(
      sequencer.programSyncPolicy.mode,
      ["independent", "lockstep"],
      "$.programSequencer.programSyncPolicy.mode",
      "programSequencer.programSyncPolicy.mode",
      issues,
    );
  }
}

function validateVoice(
  voice: unknown,
  voicePath: string,
  voiceIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if (!isRecord(voice)) {
    addIssue(issues, voicePath, "voice.notObject", "Voice must be an object.");
    return;
  }

  expectString(voice.id, `${voicePath}.id`, "voice.id", issues);
  expectString(voice.name, `${voicePath}.name`, "voice.name", issues);
  expectRecord(voice.pattern, `${voicePath}.pattern`, "voice.pattern", issues);
  expectRecord(voice.instrument, `${voicePath}.instrument`, "voice.instrument", issues);
  expectRecord(voice.visualizer, `${voicePath}.visualizer`, "voice.visualizer", issues);

  if (typeof voice.id === "string") {
    if (voiceIds.has(voice.id)) {
      addIssue(issues, `${voicePath}.id`, "voice.duplicateId", `Voice id "${voice.id}" must be unique in its Program.`);
    }
    voiceIds.add(voice.id);
  }

  if (isRecord(voice.pattern)) {
    validatePattern(voice.pattern, `${voicePath}.pattern`, issues);
  }

  if (isRecord(voice.instrument)) {
    expectString(voice.instrument.id, `${voicePath}.instrument.id`, "instrument.id", issues);
    expectOneOf(voice.instrument.type, ["sampler", "polySh101"], `${voicePath}.instrument.type`, "instrument.type", issues);
    expectRecord(voice.instrument.defaults, `${voicePath}.instrument.defaults`, "instrument.defaults", issues);
  }

  if (isRecord(voice.visualizer)) {
    expectString(voice.visualizer.id, `${voicePath}.visualizer.id`, "visualizer.id", issues);
    expectOneOf(
      voice.visualizer.type,
      ["colorWash", "shapeBurst"],
      `${voicePath}.visualizer.type`,
      "visualizer.type",
      issues,
    );
    expectRecord(voice.visualizer.defaults, `${voicePath}.visualizer.defaults`, "visualizer.defaults", issues);
  }

  if (voice.ui !== undefined) {
    validateUIDevice(voice.ui, `${voicePath}.ui`, issues);
  }
}

function validatePattern(pattern: Record<string, unknown>, patternPath: string, issues: ValidationIssue[]): void {
  expectString(pattern.id, `${patternPath}.id`, "pattern.id", issues);
  expectLiteral(pattern.type, "stepSequencer", `${patternPath}.type`, "pattern.type", issues);
  expectIntegerInRange(pattern.stepCount, 1, 64, `${patternPath}.stepCount`, "pattern.stepCount", issues);
  expectPositiveNumber(pattern.tempoBpm, `${patternPath}.tempoBpm`, "pattern.tempoBpm", issues);
  expectPositiveNumber(pattern.stepDurationBeats, `${patternPath}.stepDurationBeats`, "pattern.stepDurationBeats", issues);
  expectArray(pattern.stepEvents, `${patternPath}.stepEvents`, "pattern.stepEvents", issues);

  if (pattern.repetitions !== undefined) {
    expectIntegerInRange(pattern.repetitions, 1, 10_000, `${patternPath}.repetitions`, "pattern.repetitions", issues);
  }

  if (Array.isArray(pattern.stepEvents)) {
    const seenSteps = new Set<number>();

    pattern.stepEvents.forEach((stepEvent, stepEventIndex) => {
      validateStepEvent(
        stepEvent,
        `${patternPath}.stepEvents[${stepEventIndex}]`,
        typeof pattern.stepCount === "number" ? pattern.stepCount : undefined,
        seenSteps,
        issues,
      );
    });
  }
}

function validateStepEvent(
  stepEvent: unknown,
  stepEventPath: string,
  stepCount: number | undefined,
  seenSteps: Set<number>,
  issues: ValidationIssue[],
): void {
  if (!isRecord(stepEvent)) {
    addIssue(issues, stepEventPath, "stepEvent.notObject", "Step Event must be an object.");
    return;
  }

  if (typeof stepCount === "number") {
    expectIntegerInRange(stepEvent.step, 0, stepCount - 1, `${stepEventPath}.step`, "stepEvent.step", issues);
  } else {
    expectNonNegativeInteger(stepEvent.step, `${stepEventPath}.step`, "stepEvent.step", issues);
  }

  if (typeof stepEvent.step === "number" && Number.isInteger(stepEvent.step)) {
    if (seenSteps.has(stepEvent.step)) {
      addIssue(
        issues,
        `${stepEventPath}.step`,
        "stepEvent.duplicateStep",
        `Step ${stepEvent.step} has more than one Step Event in this Pattern.`,
      );
    }
    seenSteps.add(stepEvent.step);
  }

  if (stepEvent.instrumentTrigger !== undefined) {
    validateTrigger(stepEvent.instrumentTrigger, `${stepEventPath}.instrumentTrigger`, "instrumentTrigger", issues);
  }

  if (stepEvent.visualizerTrigger !== undefined) {
    validateTrigger(stepEvent.visualizerTrigger, `${stepEventPath}.visualizerTrigger`, "visualizerTrigger", issues);
  }

  if (stepEvent.parameterLocks !== undefined) {
    validateParameterLocks(stepEvent.parameterLocks, `${stepEventPath}.parameterLocks`, issues);
  }

  const event = stepEvent as unknown as StepEvent;
  if (!hasEnabledTrigger(event.instrumentTrigger) && !hasEnabledTrigger(event.visualizerTrigger) && !hasParameterLocks(event.parameterLocks)) {
    addIssue(
      issues,
      stepEventPath,
      "stepEvent.empty",
      "Step Event must include an enabled Instrument Trigger, an enabled Visualizer Trigger, or Parameter Locks.",
    );
  }
}

function validateTrigger(
  trigger: unknown,
  triggerPath: string,
  codePrefix: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(trigger)) {
    addIssue(issues, triggerPath, `${codePrefix}.notObject`, "Trigger must be an object.");
    return;
  }

  expectBoolean(trigger.enabled, `${triggerPath}.enabled`, `${codePrefix}.enabled`, issues);

  if (trigger.durationMs !== undefined) {
    expectPositiveNumber(trigger.durationMs, `${triggerPath}.durationMs`, `${codePrefix}.durationMs`, issues);
  }
}

function validateParameterLocks(parameterLocks: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(parameterLocks)) {
    addIssue(issues, path, "parameterLocks.notObject", "Parameter Locks must be an object.");
    return;
  }

  if (parameterLocks.instrument !== undefined) {
    expectRecord(parameterLocks.instrument, `${path}.instrument`, "parameterLocks.instrument", issues);
  }

  if (parameterLocks.visualizer !== undefined) {
    expectRecord(parameterLocks.visualizer, `${path}.visualizer`, "parameterLocks.visualizer", issues);
  }
}

function validateUIDevice(ui: unknown, uiPath: string, issues: ValidationIssue[]): void {
  if (!isRecord(ui)) {
    addIssue(issues, uiPath, "ui.notObject", "UI Device must be an object.");
    return;
  }

  expectString(ui.id, `${uiPath}.id`, "ui.id", issues);
  expectLiteral(ui.type, "choicePrompt", `${uiPath}.type`, "ui.type", issues);
  expectRecord(ui.prompt, `${uiPath}.prompt`, "ui.prompt", issues);

  if (!isRecord(ui.prompt)) {
    return;
  }

  expectString(ui.prompt.id, `${uiPath}.prompt.id`, "ui.prompt.id", issues);
  expectString(ui.prompt.text, `${uiPath}.prompt.text`, "ui.prompt.text", issues);
  expectArray(ui.prompt.choices, `${uiPath}.prompt.choices`, "ui.prompt.choices", issues);
  expectOneOf(
    ui.prompt.applyBoundary,
    ["immediate", "nextStep", "nextBeat", "nextBar", "patternLoopEnd", "patternRunEnd", "programEnd"],
    `${uiPath}.prompt.applyBoundary`,
    "ui.prompt.applyBoundary",
    issues,
  );

  if (Array.isArray(ui.prompt.choices)) {
    ui.prompt.choices.forEach((choice, choiceIndex) => {
      if (!isRecord(choice)) {
        addIssue(
          issues,
          `${uiPath}.prompt.choices[${choiceIndex}]`,
          "ui.prompt.choice.notObject",
          "Choice must be an object.",
        );
        return;
      }

      expectString(choice.id, `${uiPath}.prompt.choices[${choiceIndex}].id`, "ui.prompt.choice.id", issues);
      expectString(choice.label, `${uiPath}.prompt.choices[${choiceIndex}].label`, "ui.prompt.choice.label", issues);
    });
  }
}

function validateCompletion(
  completion: Record<string, unknown>,
  programPath: string,
  voiceIds: Set<string>,
  issues: ValidationIssue[],
): void {
  expectOneOf(
    completion.type,
    ["patternRepetitions", "forever", "hostAction", "uiChoice"],
    `${programPath}.completion.type`,
    "program.completion.type",
    issues,
  );

  if (completion.type === "patternRepetitions") {
    expectString(
      completion.sourceVoiceId,
      `${programPath}.completion.sourceVoiceId`,
      "program.completion.sourceVoiceId",
      issues,
    );
    expectIntegerInRange(
      completion.repetitions,
      1,
      10_000,
      `${programPath}.completion.repetitions`,
      "program.completion.repetitions",
      issues,
    );
    expectRecord(
      completion.onComplete,
      `${programPath}.completion.onComplete`,
      "program.completion.onComplete",
      issues,
    );

    if (typeof completion.sourceVoiceId === "string" && !voiceIds.has(completion.sourceVoiceId)) {
      addIssue(
        issues,
        `${programPath}.completion.sourceVoiceId`,
        "program.completion.unknownVoice",
        `Completion source Voice "${completion.sourceVoiceId}" is not defined in this Program.`,
      );
    }
  }
}

function hasEnabledTrigger(trigger: unknown): boolean {
  return isRecord(trigger) && trigger.enabled === true;
}

function hasParameterLocks(parameterLocks: unknown): boolean {
  if (!isRecord(parameterLocks)) {
    return false;
  }

  return nonEmptyRecord(parameterLocks.instrument) || nonEmptyRecord(parameterLocks.visualizer);
}

function nonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function expectString(
  value: unknown,
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || value.length === 0) {
    addIssue(issues, path, code, "Expected a non-empty string.");
  }
}

function expectBoolean(
  value: unknown,
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "boolean") {
    addIssue(issues, path, code, "Expected a boolean.");
  }
}

function expectArray(
  value: unknown,
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    addIssue(issues, path, code, "Expected an array.");
  }
}

function expectRecord(
  value: unknown,
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, code, "Expected an object.");
  }
}

function expectLiteral<T extends string>(
  value: unknown,
  expected: T,
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (value !== expected) {
    addIssue(issues, path, code, `Expected "${expected}".`);
  }
}

function expectOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    addIssue(issues, path, code, `Expected one of: ${allowed.join(", ")}.`);
  }
}

function expectPositiveNumber(
  value: unknown,
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    addIssue(issues, path, code, "Expected a positive finite number.");
  }
}

function expectNonNegativeInteger(
  value: unknown,
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    addIssue(issues, path, code, "Expected a non-negative integer.");
  }
}

function expectIntegerInRange(
  value: unknown,
  min: number,
  max: number,
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    addIssue(issues, path, code, `Expected an integer from ${min} to ${max}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}
