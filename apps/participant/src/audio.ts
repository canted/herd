import type { ParameterBag, ParameterValue } from "@herd/composition";

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
  const frequency = pitchToFrequency(readString(parameters.pitch, "C3"));
  const velocity = clampNumber(readNumber(parameters.velocity, 82) / 127, 0.05, 1);
  const filter = readObject(parameters.filter);
  const cutoff = 180 + clampNumber(readNumber(filter.cutoff, 0.42), 0, 1) * 5200;
  const resonance = clampNumber(readNumber(filter.resonance, 0.18), 0, 1) * 14;
  const envelope = readObject(parameters.envelope);
  const attack = readNumber(envelope.attackMs, 5) / 1000;
  const release = readNumber(envelope.releaseMs, 90) / 1000;
  const duration = Math.max(durationMs / 1000, 0.04);
  const stopAt = when + duration + release + 0.02;

  const oscillator = context.createOscillator();
  const sub = context.createOscillator();
  const filterNode = context.createBiquadFilter();
  const gain = context.createGain();

  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(frequency, when);
  sub.type = "square";
  sub.frequency.setValueAtTime(frequency / 2, when);
  filterNode.type = "lowpass";
  filterNode.frequency.setValueAtTime(cutoff, when);
  filterNode.Q.setValueAtTime(resonance, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, velocity * 0.18), when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + release);

  oscillator.connect(filterNode);
  sub.connect(filterNode);
  filterNode.connect(gain);
  gain.connect(context.destination);

  oscillator.start(when);
  sub.start(when);
  oscillator.stop(stopAt);
  sub.stop(stopAt);
}

export function pitchToFrequency(pitch: string): number {
  const match = pitch.match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (match === null) {
    return 130.81;
  }

  const [, note, octaveText] = match;
  const semitone = pitchToMidi[note ?? "C"] ?? 0;
  const octave = Number(octaveText);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
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
