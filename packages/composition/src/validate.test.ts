import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateComposition } from "./index";

function loadFixture(): unknown {
  return JSON.parse(
    readFileSync(new URL("../fixtures/rehearsal-basic.json", import.meta.url), "utf8"),
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("validateComposition", () => {
  it("accepts the rehearsal fixture", () => {
    const result = validateComposition(loadFixture());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe("0.1.0");
      expect(result.value.programs).toHaveLength(2);
    }
  });

  it("allows Parameter-only Step Events", () => {
    const result = validateComposition(loadFixture());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stepEvent = result.value.programs[0]?.voices[0]?.pattern.stepEvents.find(
      (event) => event.step === 12,
    );

    expect(stepEvent?.instrumentTrigger).toBeUndefined();
    expect(stepEvent?.visualizerTrigger).toBeUndefined();
    expect(stepEvent?.parameterLocks?.instrument).toEqual({ "filter.cutoff": 0.72 });
  });

  it("rejects step sequencers over 64 steps", () => {
    const fixture = clone(loadFixture()) as any;
    fixture.programs[0].voices[0].pattern.stepCount = 65;

    const result = validateComposition(fixture);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "$.programs[0].voices[0].pattern.stepCount",
        code: "pattern.stepCount",
        message: "Expected an integer from 1 to 64.",
      });
    }
  });

  it("rejects empty Step Events", () => {
    const fixture = clone(loadFixture()) as any;
    fixture.programs[0].voices[0].pattern.stepEvents.push({ step: 15 });

    const result = validateComposition(fixture);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain("stepEvent.empty");
    }
  });
});
