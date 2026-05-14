export type DeviceRole = "beacon" | "listener" | "backupBeacon" | "observer";
export type MicStatus = "n/a" | "unknown" | "granted" | "denied";
export type Readiness = "ready" | "warning" | "blocked";
export type PositionState = "fresh" | "stale" | "unlocated";

export interface ChirpProfile {
  id: string;
  label: string;
  band: string;
  durationMs: number;
  slotMs: number;
  guardMs: number;
  gain: number;
  threshold: number;
  repeats: number;
}

export interface LabDevice {
  id: string;
  label: string;
  role: DeviceRole;
  audio: Readiness;
  mic: MicStatus;
  sync: Readiness;
  sampleRate: number;
  x: number;
  y: number;
}

export interface ScanMeasurement {
  scanId: string;
  listenerDeviceId: string;
  beaconDeviceId: string;
  detected: boolean;
  arrivalTimeMs: number | null;
  confidence: number;
  snr: number | null;
  peakWidthMs: number | null;
  processingMs: number;
}

export interface LayoutPoint {
  scanId: string;
  deviceId: string;
  x: number;
  y: number;
  confidence: number;
  state: PositionState;
}

export interface ScanResult {
  scanId: string;
  startedAt: string;
  profile: ChirpProfile;
  measurements: ScanMeasurement[];
  layout: LayoutPoint[];
  warnings: string[];
}

export const chirpProfiles: ChirpProfile[] = [
  {
    id: "audible-short",
    label: "Audible short",
    band: "1.4-4.2 kHz",
    durationMs: 90,
    slotMs: 180,
    guardMs: 90,
    gain: 0.28,
    threshold: 0.42,
    repeats: 1,
  },
  {
    id: "audible-robust",
    label: "Audible robust",
    band: "1.2-5.8 kHz",
    durationMs: 160,
    slotMs: 260,
    guardMs: 140,
    gain: 0.42,
    threshold: 0.36,
    repeats: 2,
  },
  {
    id: "near-ultrasonic-test",
    label: "Near-ultrasonic test",
    band: "16-19 kHz",
    durationMs: 120,
    slotMs: 240,
    guardMs: 140,
    gain: 0.22,
    threshold: 0.48,
    repeats: 1,
  },
  {
    id: "noisy-room",
    label: "Noisy room",
    band: "900 Hz-6.4 kHz",
    durationMs: 240,
    slotMs: 360,
    guardMs: 180,
    gain: 0.58,
    threshold: 0.32,
    repeats: 3,
  },
  {
    id: "long-guard-reverb",
    label: "Long-guard reverb",
    band: "1.1-4.8 kHz",
    durationMs: 180,
    slotMs: 320,
    guardMs: 260,
    gain: 0.38,
    threshold: 0.38,
    repeats: 2,
  },
];

export function createDefaultDevices(): LabDevice[] {
  return [
    createDevice("north wall", "beacon", 0.12, 0.18, 48_000),
    createDevice("table left", "beacon", 0.32, 0.78, 44_100),
    createDevice("table right", "beacon", 0.84, 0.72, 48_000),
    createDevice("listener A", "listener", 0.5, 0.42, 48_000),
    createDevice("listener B", "listener", 0.72, 0.38, 44_100),
  ];
}

export function createDevice(
  label: string,
  role: DeviceRole,
  x = 0.5,
  y = 0.5,
  sampleRate = 48_000,
): LabDevice {
  return {
    id: `device-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID()}`,
    label,
    role,
    audio: role === "observer" ? "warning" : "ready",
    mic: role === "listener" || role === "beacon" || role === "backupBeacon" ? "granted" : "n/a",
    sync: "ready",
    sampleRate,
    x,
    y,
  };
}

export function runSimulatedScan(
  devices: LabDevice[],
  profile: ChirpProfile,
  now = new Date(),
): ScanResult {
  const scanId = `scan-${now.getTime()}`;
  const beacons = devices.filter((device) => device.role === "beacon" || device.role === "backupBeacon");
  const listeners = devices.filter((device) => device.role === "listener" || device.role === "beacon" || device.role === "backupBeacon");
  const warnings: string[] = [];

  if (beacons.filter((device) => device.role === "beacon").length < 3) {
    warnings.push("Use at least 3 primary beacons before trusting relative layout.");
  }

  if (listeners.length === 0) {
    warnings.push("No listener-capable devices are available for this scan.");
  }

  const measurements: ScanMeasurement[] = [];

  for (const listener of listeners) {
    if (listener.mic !== "granted" || listener.audio === "blocked") continue;

    for (const beacon of beacons) {
      if (listener.id === beacon.id || beacon.audio !== "ready") continue;

      const distance = Math.hypot(listener.x - beacon.x, listener.y - beacon.y);
      const quality = clamp(1 - distance * 0.55 + profile.gain * 0.28 - profile.threshold * 0.18, 0.08, 0.98);
      const detected = quality >= profile.threshold;
      const arrivalTimeMs = detected ? Math.round(distance * 24 + profile.guardMs + stableJitter(listener.id, beacon.id)) : null;
      measurements.push({
        scanId,
        listenerDeviceId: listener.id,
        beaconDeviceId: beacon.id,
        detected,
        arrivalTimeMs,
        confidence: detected ? round(quality) : round(quality * 0.35),
        snr: detected ? round(10 + quality * 22) : null,
        peakWidthMs: detected ? round(4 + (1 - quality) * 18) : null,
        processingMs: Math.round(18 + profile.durationMs * 0.12 + profile.repeats * 7),
      });
    }
  }

  return {
    scanId,
    startedAt: now.toISOString(),
    profile,
    measurements,
    layout: solveApproximateLayout(devices, measurements, scanId),
    warnings,
  };
}

export function summarizeScan(result: ScanResult): { detected: number; missed: number; averageConfidence: number } {
  const detected = result.measurements.filter((measurement) => measurement.detected);
  const missed = result.measurements.length - detected.length;
  const averageConfidence = detected.length === 0
    ? 0
    : detected.reduce((sum, measurement) => sum + measurement.confidence, 0) / detected.length;

  return {
    detected: detected.length,
    missed,
    averageConfidence: round(averageConfidence),
  };
}

export function createLabExport(
  sessionName: string,
  devices: LabDevice[],
  result: ScanResult | null,
  notes: string,
) {
  return {
    format: "herd-positioning-lab",
    version: 1,
    exportedAt: new Date().toISOString(),
    sessionName,
    notes,
    userAgent: typeof navigator === "undefined" ? "node" : navigator.userAgent,
    devices,
    latestScan: result,
  };
}

function solveApproximateLayout(
  devices: LabDevice[],
  measurements: ScanMeasurement[],
  scanId: string,
): LayoutPoint[] {
  return devices.map((device) => {
    const incoming = measurements.filter((measurement) => measurement.listenerDeviceId === device.id && measurement.detected);
    const confidence = incoming.length === 0
      ? 0
      : incoming.reduce((sum, measurement) => sum + measurement.confidence, 0) / incoming.length;

    return {
      scanId,
      deviceId: device.id,
      x: round(device.x),
      y: round(device.y),
      confidence: round(confidence),
      state: confidence >= 0.62 ? "fresh" : confidence > 0 ? "stale" : "unlocated",
    };
  });
}

function stableJitter(a: string, b: string): number {
  const text = `${a}:${b}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 997;
  }
  return (hash % 9) - 4;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
