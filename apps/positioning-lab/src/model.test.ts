import { describe, expect, it } from "vitest";
import {
  chirpProfiles,
  createDefaultDevices,
  createLabExport,
  createPositioningSignalSamples,
  parseFrequencyBand,
  runSimulatedScan,
  summarizeScan,
} from "./model";

describe("positioning lab model", () => {
  it("runs deterministic simulated scans across beacons and listeners", () => {
    const result = runSimulatedScan(
      createDefaultDevices(),
      chirpProfiles[1]!,
      new Date("2026-05-14T12:00:00.000Z"),
    );
    const summary = summarizeScan(result);

    expect(result.scanId).toBe("scan-1778760000000");
    expect(result.measurements.length).toBeGreaterThan(0);
    expect(summary.detected).toBeGreaterThan(0);
    expect(result.layout.some((point) => point.state === "fresh")).toBe(true);
  });

  it("parses chirp profile bands with shorthand units", () => {
    expect(parseFrequencyBand("1.4-4.2 kHz")).toEqual([1400, 4200]);
    expect(parseFrequencyBand("900 Hz-6.4 kHz")).toEqual([900, 6400]);
    expect(parseFrequencyBand("21 kHz")).toEqual([21000, 21000]);
    expect(parseFrequencyBand("2-21 kHz")).toEqual([2000, 21000]);
  });

  it("creates a coded ultrasonic noise rhythm with brief bursts", () => {
    const profile = chirpProfiles.find((candidate) => candidate.id === "coded-ultrasonic-noise");
    expect(profile).toBeDefined();
    expect(profile?.signal).toBe("codedNoise");
    expect(profile?.band).toBe("2-21 kHz");
    expect(profile?.burstMs).toBeGreaterThanOrEqual(10);
    expect(profile?.burstMs).toBeLessThanOrEqual(20);

    const sampleRate = 48_000;
    const samples = createPositioningSignalSamples(sampleRate, profile!);
    const chipSamples = Math.round(((profile?.chipMs ?? 32) / 1000) * sampleRate);
    const firstChipEnergy = sumAbs(samples, 0, chipSamples);
    const secondChipEnergy = sumAbs(samples, chipSamples, chipSamples);

    expect(samples.length).toBe(Math.round((profile!.durationMs / 1000) * sampleRate));
    expect(firstChipEnergy).toBeGreaterThan(1);
    expect(secondChipEnergy).toBe(0);
  });

  it("warns when primary beacon count is too low", () => {
    const devices = createDefaultDevices().map((device, index) => index === 0 ? device : { ...device, role: "listener" as const });
    const result = runSimulatedScan(devices, chirpProfiles[0]!, new Date("2026-05-14T12:00:00.000Z"));

    expect(result.warnings).toContain("Use at least 3 primary beacons before trusting relative layout.");
  });

  it("exports enough evidence for later analysis", () => {
    const devices = createDefaultDevices();
    const result = runSimulatedScan(devices, chirpProfiles[1]!, new Date("2026-05-14T12:00:00.000Z"));
    const exported = createLabExport("north gallery", devices, result, "quiet room");

    expect(exported).toMatchObject({
      format: "herd-positioning-lab",
      version: 1,
      sessionName: "north gallery",
      notes: "quiet room",
    });
    expect(exported.latestScan?.measurements[0]).toHaveProperty("confidence");
  });
});

function sumAbs(samples: Float32Array, offset: number, count: number): number {
  let sum = 0;
  for (let index = offset; index < Math.min(samples.length, offset + count); index += 1) {
    sum += Math.abs(samples[index] ?? 0);
  }
  return sum;
}
