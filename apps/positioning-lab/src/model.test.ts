import { describe, expect, it } from "vitest";
import {
  chirpProfiles,
  createDefaultDevices,
  createLabExport,
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
