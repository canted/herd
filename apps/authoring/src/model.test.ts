import { describe, expect, it } from "vitest";
import {
  clampStepCount,
  clearModulationRoute,
  createBlankComposition,
  ensureStepEvent,
  getProgram,
  getModulationRoutes,
  getStepLocks,
  getVoice,
  setModulationRoute,
  setNestedParameter,
  setStepEventLock,
  updateModulationRoute,
  validateAuthoringComposition,
} from "./model";

describe("authoring model", () => {
  it("creates a valid editable Composition", () => {
    const composition = createBlankComposition();
    const summary = validateAuthoringComposition(composition);

    expect(summary.errors).toEqual([]);
    expect(composition.programs[0]?.voices[0]?.pattern.stepCount).toBe(16);
  });

  it("clamps Pattern step counts to the supported 1..64 range", () => {
    expect(clampStepCount(0)).toBe(1);
    expect(clampStepCount(65)).toBe(64);
    expect(clampStepCount(32.4)).toBe(32);
  });

  it("sets Parameter Locks on Parameter-only Step Events", () => {
    const composition = createBlankComposition();
    const program = getProgram(composition, composition.programs[0]!.id);
    const voice = getVoice(program, program.voices[0]!.id);
    const event = ensureStepEvent(voice, 7);

    setStepEventLock(event, "instrument", "filter.cutoff", 0.72);

    expect(event.instrumentTrigger).toBeUndefined();
    expect(event.visualizerTrigger).toBeUndefined();
    expect(getStepLocks(event)).toEqual([
      {
        scope: "instrument",
        path: "filter.cutoff",
        value: 0.72,
      },
    ]);
  });

  it("stores captured modulation routes on the Voice", () => {
    const composition = createBlankComposition();
    const program = getProgram(composition, composition.programs[0]!.id);
    const voice = getVoice(program, program.voices[0]!.id);

    setModulationRoute(voice, {
      device: "instrument",
      modulator: 1,
      source: "lfo",
      target: "filter.cutoff",
      amount: 0.35,
      enabled: true,
      range: { min: 0.1, max: 0.8 },
    });

    expect(voice.parameters?.modulationRoutes).toEqual([
      {
        device: "instrument",
        modulator: 1,
        source: "lfo",
        target: "filter.cutoff",
        amount: 0.35,
        enabled: true,
        range: { min: 0.1, max: 0.8 },
      },
    ]);
  });

  it("updates and clears captured modulation routes", () => {
    const composition = createBlankComposition();
    const program = getProgram(composition, composition.programs[0]!.id);
    const voice = getVoice(program, program.voices[0]!.id);

    setModulationRoute(voice, {
      device: "visualizer",
      modulator: 2,
      source: "choice",
      target: "brightness",
      amount: 0.2,
    });
    updateModulationRoute(voice, { device: "visualizer", modulator: 2, target: "brightness" }, {
      amount: 0.65,
      enabled: false,
      range: { min: 0.2, max: 0.9 },
    });

    expect(getModulationRoutes(voice)).toEqual([
      {
        device: "visualizer",
        modulator: 2,
        source: "choice",
        target: "brightness",
        amount: 0.65,
        enabled: false,
        range: { min: 0.2, max: 0.9 },
      },
    ]);

    clearModulationRoute(voice, { device: "visualizer", modulator: 2, target: "brightness" });

    expect(getModulationRoutes(voice)).toEqual([]);
  });

  it("sets nested device parameters", () => {
    const composition = createBlankComposition();
    const program = getProgram(composition, composition.programs[0]!.id);
    const voice = getVoice(program, program.voices[0]!.id);

    setNestedParameter(voice.instrument.defaults, "filter.cutoff", 0.61);

    expect(voice.instrument.defaults.filter).toEqual({
      cutoff: 0.61,
      resonance: 0.2,
      envelopeAmount: 0.35,
    });
  });
});
