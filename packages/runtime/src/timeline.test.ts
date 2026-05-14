import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type Composition,
  validateComposition,
} from "../../composition/src/index";
import {
  applyParameterLocks,
  buildCompositionTimeline,
  buildRuntimeTimeline,
  skipStaleEvents,
} from "./index";

function loadComposition(): Composition {
  const fixture = JSON.parse(
    readFileSync(new URL("../../composition/fixtures/rehearsal-basic.json", import.meta.url), "utf8"),
  );
  const result = validateComposition(fixture);

  if (!result.ok) {
    throw new Error(`Invalid fixture: ${JSON.stringify(result.issues, null, 2)}`);
  }

  return result.value;
}

describe("buildRuntimeTimeline", () => {
  it("creates deterministic Step Event runtime events for the initial Program", () => {
    const timeline = buildRuntimeTimeline(loadComposition());

    expect(timeline.map((event) => `${event.timeMs}:${event.type}:step-${"step" in event ? event.step : "na"}`)).toEqual([
      "0:parameterLocks:step-0",
      "0:instrument:step-0",
      "0:visualizer:step-0",
      "500:parameterLocks:step-4",
      "500:visualizer:step-4",
      "1000:parameterLocks:step-8",
      "1000:instrument:step-8",
      "1500:parameterLocks:step-12",
      "2000:parameterLocks:step-0",
      "2000:instrument:step-0",
      "2000:visualizer:step-0",
      "2500:parameterLocks:step-4",
      "2500:visualizer:step-4",
      "3000:parameterLocks:step-8",
      "3000:instrument:step-8",
      "3500:parameterLocks:step-12",
    ]);
  });

  it("merges Instrument and Visualizer defaults with Step Event Parameter Locks", () => {
    const timeline = buildRuntimeTimeline(loadComposition());
    const instrumentEvent = timeline.find(
      (event) => event.type === "instrument" && event.step === 8,
    );
    const visualizerEvent = timeline.find(
      (event) => event.type === "visualizer" && event.step === 4,
    );

    expect(instrumentEvent?.type).toBe("instrument");
    if (instrumentEvent?.type === "instrument") {
      expect(instrumentEvent.parameters.pitch).toBe("G3");
      expect(instrumentEvent.parameters.filter).toEqual({
        cutoff: 0.58,
        resonance: 0.2,
      });
    }

    expect(visualizerEvent?.type).toBe("visualizer");
    if (visualizerEvent?.type === "visualizer") {
      expect(visualizerEvent.parameters.shape).toBe("bar");
      expect(visualizerEvent.parameters.decayMs).toBe(180);
      expect(visualizerEvent.parameters.hue).toBe(140);
    }
  });

  it("emits a UI prompt event for the choice Program", () => {
    const timeline = buildRuntimeTimeline(loadComposition(), {
      programId: "choice-branch",
    });

    expect(timeline[0]).toMatchObject({
      type: "uiPrompt",
      timeMs: 0,
      programId: "choice-branch",
      voiceId: "voice-choice",
    });
    expect(timeline[0]?.type === "uiPrompt" ? timeline[0].prompt.choices.map((choice) => choice.id) : []).toEqual([
      "choice-left",
      "choice-right",
    ]);
  });

  it("builds a sequenced Composition timeline across Programs", () => {
    const timeline = buildCompositionTimeline(loadComposition());

    expect(timeline.segments).toEqual([
      {
        programId: "intro-pulse",
        startTimeMs: 0,
        durationMs: 4000,
      },
      {
        programId: "choice-branch",
        startTimeMs: 4000,
        durationMs: 2666.6666666666665,
      },
    ]);
    expect(timeline.events.some((event) => event.type === "uiPrompt" && event.timeMs === 4000)).toBe(true);
  });
});

describe("runtime timeline helpers", () => {
  it("skips stale events while preserving upcoming transport events", () => {
    const timeline = buildRuntimeTimeline(loadComposition());

    const upcoming = skipStaleEvents(timeline, 1000.1);

    expect(upcoming[0]).toMatchObject({
      type: "parameterLocks",
      timeMs: 1500,
      step: 12,
    });
    expect(upcoming.some((event) => event.timeMs < 1000.1)).toBe(false);
  });

  it("applies dotted Parameter Lock paths without mutating defaults", () => {
    const defaults = {
      filter: {
        cutoff: 0.42,
        resonance: 0.2,
      },
    };

    const merged = applyParameterLocks(defaults, {
      "filter.cutoff": 0.72,
    });

    expect(merged).toEqual({
      filter: {
        cutoff: 0.72,
        resonance: 0.2,
      },
    });
    expect(defaults.filter.cutoff).toBe(0.42);
  });
});
