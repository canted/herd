import type { Composition, ParameterBag, ParameterValue } from "@herd/composition";
import { playPolySh101Event } from "@herd/runtime";

interface EmbeddedAssetPayload {
  dataUrl: string;
  mimeType?: string;
}

interface SamplerZone {
  assetId: string;
  pitchLow: string;
  pitchHigh: string;
  velocityLow: number;
  velocityHigh: number;
  rootKey: string;
  gainDb: number;
  startMs: number;
  endMs: number;
  loop: boolean;
}

const pitchToMidi: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function playSynthEvent(
  context: AudioContext,
  when: number,
  parameters: ParameterBag,
  durationMs = 180,
): void {
  playPolySh101Event(context, when, parameters, durationMs);
}

export async function loadEmbeddedAudioAssets(
  context: AudioContext,
  composition: Composition,
): Promise<Map<string, AudioBuffer>> {
  const buffers = new Map<string, AudioBuffer>();
  const embeddedAssets = readEmbeddedAssets(composition);

  for (const asset of composition.assets) {
    if (asset.type !== "audio") continue;

    const payload = embeddedAssets[asset.id];
    if (payload === undefined) continue;

    const response = await fetch(payload.dataUrl);
    const arrayBuffer = await response.arrayBuffer();
    buffers.set(asset.id, await context.decodeAudioData(arrayBuffer));
  }

  return buffers;
}

export function getRequiredSamplerAssetIds(composition: Composition): string[] {
  const required = new Set<string>();

  for (const program of composition.programs) {
    for (const voice of program.voices) {
      if (voice.instrument.type !== "sampler") continue;
      for (const zone of readSamplerZones(voice.instrument.defaults)) {
        if (zone.assetId.length > 0) {
          required.add(zone.assetId);
        }
      }
    }
  }

  return [...required];
}

export function playSamplerEvent(
  context: AudioContext,
  when: number,
  parameters: ParameterBag,
  durationMs: number | undefined,
  buffers: ReadonlyMap<string, AudioBuffer>,
): void {
  const zones = readSamplerZones(parameters);
  const pitch = readString(parameters.pitch, "C3");
  const velocity = clampNumber(readNumber(parameters.velocity, 96), 1, 127);
  const zone = selectSamplerZone(zones, pitch, velocity);

  if (zone === undefined) return;

  const buffer = buffers.get(zone.assetId);
  if (buffer === undefined) return;

  const source = context.createBufferSource();
  const gain = context.createGain();
  const startOffset = clampNumber(zone.startMs / 1000, 0, buffer.duration);
  const configuredEnd = zone.endMs > 0 ? zone.endMs / 1000 : buffer.duration;
  const endOffset = clampNumber(configuredEnd, startOffset, buffer.duration);
  const availableDuration = Math.max(0.01, endOffset - startOffset);
  const requestedDuration = durationMs === undefined ? availableDuration : Math.max(0.01, durationMs / 1000);
  const playbackRate = 2 ** ((pitchToMidiNumber(pitch) - pitchToMidiNumber(zone.rootKey)) / 12);
  const gainScalar = dbToGain(zone.gainDb) * clampNumber(velocity / 127, 0.02, 1);

  source.buffer = buffer;
  source.playbackRate.setValueAtTime(playbackRate, when);
  source.loop = zone.loop;
  if (zone.loop) {
    source.loopStart = startOffset;
    source.loopEnd = endOffset;
  }

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainScalar), when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + requestedDuration + 0.03);

  source.connect(gain);
  gain.connect(context.destination);

  if (zone.loop) {
    source.start(when, startOffset);
  } else {
    source.start(when, startOffset, Math.min(availableDuration, requestedDuration));
  }
  source.stop(when + requestedDuration + 0.04);
}

export function pitchToFrequency(pitch: string): number {
  const midi = pitchToMidiNumber(pitch);
  return 440 * 2 ** ((midi - 69) / 12);
}

export function pitchToMidiNumber(pitch: string): number {
  const match = pitch.match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (match === null) {
    return 48;
  }

  const [, note, octaveText] = match;
  const semitone = pitchToMidi[note ?? "C"] ?? 0;
  const octave = Number(octaveText);
  return (octave + 1) * 12 + semitone;
}

function readEmbeddedAssets(composition: Composition): Record<string, EmbeddedAssetPayload> {
  const metadata = composition.metadata;
  if (!isPlainRecord(metadata)) return {};

  const embeddedAssets = metadata.embeddedAssets;
  if (!isPlainRecord(embeddedAssets)) return {};

  const result: Record<string, EmbeddedAssetPayload> = {};
  for (const [assetId, payload] of Object.entries(embeddedAssets)) {
    if (!isPlainRecord(payload) || typeof payload.dataUrl !== "string") continue;
    result[assetId] = {
      dataUrl: payload.dataUrl,
      ...(typeof payload.mimeType === "string" ? { mimeType: payload.mimeType } : {}),
    };
  }

  return result;
}

function readSamplerZones(parameters: ParameterBag): SamplerZone[] {
  if (!Array.isArray(parameters.zones)) return [];

  return parameters.zones.flatMap((candidate) => {
    if (!isPlainRecord(candidate) || typeof candidate.assetId !== "string") return [];
    return [{
      assetId: candidate.assetId,
      pitchLow: typeof candidate.pitchLow === "string" ? candidate.pitchLow : "C1",
      pitchHigh: typeof candidate.pitchHigh === "string" ? candidate.pitchHigh : "C6",
      velocityLow: readNumber(candidate.velocityLow, 1),
      velocityHigh: readNumber(candidate.velocityHigh, 127),
      rootKey: typeof candidate.rootKey === "string" ? candidate.rootKey : "C3",
      gainDb: readNumber(candidate.gainDb, 0),
      startMs: readNumber(candidate.startMs, 0),
      endMs: readNumber(candidate.endMs, 0),
      loop: candidate.loop === true,
    }];
  });
}

function selectSamplerZone(zones: SamplerZone[], pitch: string, velocity: number): SamplerZone | undefined {
  const midi = pitchToMidiNumber(pitch);
  return zones.find((zone) => {
    const low = pitchToMidiNumber(zone.pitchLow);
    const high = pitchToMidiNumber(zone.pitchHigh);
    return midi >= low && midi <= high && velocity >= zone.velocityLow && velocity <= zone.velocityHigh;
  }) ?? zones[0];
}

function readObject(value: ParameterValue | undefined): ParameterBag {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function readString(value: ParameterValue | undefined, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: ParameterValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
