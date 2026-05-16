export type DeviceRole = "beacon" | "listener" | "backupBeacon" | "observer";
export type MicStatus = "n/a" | "unknown" | "granted" | "denied";
export type Readiness = "ready" | "warning" | "blocked";
export type PositionState = "fresh" | "stale" | "unlocated";
export type PositioningSignalKind = "chirp" | "codedNoise";

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
  signal?: PositioningSignalKind;
  code?: string;
  chipMs?: number;
  burstMs?: number;
  seed?: number;
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
    id: "coded-ultrasonic-noise",
    label: "Coded ultrasonic noise",
    band: "2-21 kHz",
    durationMs: 640,
    slotMs: 860,
    guardMs: 220,
    gain: 0.28,
    threshold: 0.22,
    repeats: 1,
    signal: "codedNoise",
    code: "10110100101110010110",
    chipMs: 32,
    burstMs: 14,
    seed: 21_000,
  },
  {
    id: "audible-diagnostic",
    label: "Audible diagnostic",
    band: "700 Hz-2.8 kHz",
    durationMs: 520,
    slotMs: 720,
    guardMs: 220,
    gain: 0.85,
    threshold: 0.18,
    repeats: 2,
  },
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
    band: "21 kHz",
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

export function parseFrequencyBand(band: string): [number, number] {
  const matches = [...band.matchAll(/([\d.]+)\s*(kHz|Hz)?/gi)];
  if (matches.length === 0) {
    return [1200, 5800];
  }

  const tokens = matches.map((match) => ({
    value: Number(match[1]),
    unit: match[2]?.toLowerCase() as "khz" | "hz" | undefined,
  }));
  const values = tokens.map((token, index) => {
    const unit = token.unit ?? tokens[index + 1]?.unit ?? tokens[index - 1]?.unit ?? "hz";
    return unit === "khz" ? token.value * 1000 : token.value;
  });
  const startHz = values[0] ?? 1200;
  return [startHz, values[1] ?? startHz];
}

export function createPositioningSignalSamples(sampleRate: number, profile: ChirpProfile): Float32Array {
  if (profile.signal === "codedNoise") {
    return createCodedNoiseSamples(sampleRate, profile);
  }
  return createChirpBurstSamples(sampleRate, profile);
}

function createChirpBurstSamples(sampleRate: number, profile: ChirpProfile): Float32Array {
  const chirp = createChirpSamples(sampleRate, profile);
  const repeats = Math.max(1, profile.repeats);
  const totalSamples = Math.max(
    chirp.length,
    Math.round((((repeats - 1) * profile.slotMs + profile.durationMs) / 1000) * sampleRate),
  );
  const burst = new Float32Array(totalSamples);
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const offset = Math.round(((repeat * profile.slotMs) / 1000) * sampleRate);
    for (let index = 0; index < chirp.length && offset + index < burst.length; index += 1) {
      const target = offset + index;
      burst[target] = (burst[target] ?? 0) + (chirp[index] ?? 0);
    }
  }
  return burst;
}

function createChirpSamples(sampleRate: number, profile: ChirpProfile): Float32Array {
  const [startHz, endHz] = parseFrequencyBand(profile.band);
  const durationSeconds = profile.durationMs / 1000;
  const sampleCount = Math.max(1, Math.round(durationSeconds * sampleRate));
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const progress = index / Math.max(1, sampleCount - 1);
    const phase = 2 * Math.PI * (startHz * t + ((endHz - startHz) / (2 * durationSeconds)) * t * t);
    const windowValue = Math.sin(Math.PI * progress);
    samples[index] = Math.sin(phase) * windowValue;
  }
  return samples;
}

function createCodedNoiseSamples(sampleRate: number, profile: ChirpProfile): Float32Array {
  const code = normalizeCode(profile.code);
  const chipMs = Math.max(1, profile.chipMs ?? 32);
  const burstMs = Math.min(chipMs, Math.max(1, profile.burstMs ?? 14));
  const durationMs = Math.max(profile.durationMs, code.length * chipMs);
  const chipSamples = Math.max(1, Math.round((chipMs / 1000) * sampleRate));
  const burstSamples = Math.max(1, Math.round((burstMs / 1000) * sampleRate));
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const samples = new Float32Array(sampleCount);
  const [bandStartHz, bandEndHz] = parseFrequencyBand(profile.band);
  const [lowHz, highHz] = clampBandToNyquist(Math.min(bandStartHz, bandEndHz), Math.max(bandStartHz, bandEndHz), sampleRate);
  const tones = createNoiseTones(profile.seed ?? hashString(profile.id), lowHz, highHz, 24);

  for (let chipIndex = 0; chipIndex < code.length; chipIndex += 1) {
    if (code[chipIndex] !== "1") continue;

    const offset = chipIndex * chipSamples;
    for (let index = 0; index < burstSamples && offset + index < samples.length; index += 1) {
      const target = offset + index;
      const t = target / sampleRate;
      const progress = index / Math.max(1, burstSamples - 1);
      const windowValue = Math.sin(Math.PI * progress);
      let value = 0;
      for (const tone of tones) {
        value += tone.amplitude * Math.sin(2 * Math.PI * tone.frequencyHz * t + tone.phase);
      }
      samples[target] = (samples[target] ?? 0) + (value / Math.sqrt(tones.length)) * windowValue;
    }
  }

  normalizeSamples(samples);
  return samples;
}

function normalizeCode(code: string | undefined): string {
  const normalized = code?.replace(/[^01]/g, "") ?? "";
  return normalized.length > 0 ? normalized : "10110100101110010110";
}

function clampBandToNyquist(lowHz: number, highHz: number, sampleRate: number): [number, number] {
  const nyquist = sampleRate / 2;
  const clampedHigh = Math.min(highHz, Math.max(400, nyquist - 250));
  const clampedLow = Math.min(lowHz, clampedHigh - 180);
  return [Math.max(80, clampedLow), Math.max(81, clampedHigh)];
}

function createNoiseTones(seed: number, lowHz: number, highHz: number, count: number): Array<{ frequencyHz: number; phase: number; amplitude: number }> {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const bandPosition = (index + 0.25 + random() * 0.5) / count;
    return {
      frequencyHz: lowHz + (highHz - lowHz) * bandPosition,
      phase: random() * Math.PI * 2,
      amplitude: 0.72 + random() * 0.56,
    };
  });
}

function normalizeSamples(samples: Float32Array): void {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak <= 0) return;
  const scale = 1 / peak;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (samples[index] ?? 0) * scale;
  }
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

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
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: `device-${slug || createCompatId()}`,
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

function createCompatId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") {
    return randomUUID.call(globalThis.crypto);
  }

  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
