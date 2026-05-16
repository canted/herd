import { describe, expect, it } from "vitest";
import {
  pitchToFrequency,
  resolvePolySh101Voices,
} from "./index";

describe("poly SH-101 voice planning", () => {
  it("uses per-step polyphonic pitch locks", () => {
    const voices = resolvePolySh101Voices({
      pitches: ["C2", "C5"],
      tune: 0,
      oscillator: {
        range: "8",
        sawLevel: 1,
        pulseLevel: 0,
        subLevel: 0,
        noise: 0,
      },
    });

    expect(voices).toHaveLength(2);
    expect(voices[0]?.frequencyHz).toBeCloseTo(pitchToFrequency("C2"), 5);
    expect(voices[1]?.frequencyHz).toBeCloseTo(pitchToFrequency("C5"), 5);
  });

  it("applies tune, range, source mixer, and filter controls", () => {
    const [plain] = resolvePolySh101Voices({
      pitch: "C3",
      tune: 0,
      oscillator: {
        range: "8",
        sawLevel: 1,
        pulseLevel: 0,
        subLevel: 0,
        noise: 0,
      },
      filter: {
        cutoff: 0.1,
        resonance: 0.1,
      },
    });
    const [edited] = resolvePolySh101Voices({
      pitch: "C3",
      tune: 12,
      oscillator: {
        range: "4",
        sawLevel: 0,
        pulseLevel: 0.25,
        subLevel: 0.9,
        subMode: "twoOctPulse",
        noise: 0.5,
      },
      filter: {
        cutoff: 0.85,
        resonance: 0.8,
        envelopeAmount: 0.75,
      },
    });

    expect(plain).toBeDefined();
    expect(edited).toBeDefined();
    expect(edited!.frequencyHz).toBeGreaterThan(plain!.frequencyHz * 3.9);
    expect(edited!.sawGain).toBe(0);
    expect(edited!.pulseGain).toBeCloseTo(0.25);
    expect(edited!.subGain).toBeCloseTo(0.9);
    expect(edited!.noiseGain).toBeCloseTo(0.5);
    expect(edited!.subPulseWidth).toBeCloseTo(0.25);
    expect(edited!.cutoffHz).toBeGreaterThan(plain!.cutoffHz);
    expect(edited!.filterPeakHz).toBeGreaterThan(edited!.cutoffHz);
    expect(edited!.resonance).toBeGreaterThan(plain!.resonance);
  });
});
