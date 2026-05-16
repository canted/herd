import type { ParameterBag, ParameterValue } from "@herd/composition";

export interface PolySh101VoicePlan {
  pitch: string;
  frequencyHz: number;
  pulseWidth: number;
  subFrequencyHz: number;
  subPulseWidth: number;
  sawGain: number;
  pulseGain: number;
  subGain: number;
  noiseGain: number;
  cutoffHz: number;
  filterPeakHz: number;
  resonance: number;
  attackSeconds: number;
  decaySeconds: number;
  sustainGain: number;
  releaseSeconds: number;
  durationSeconds: number;
  outputGain: number;
  lfoRateHz: number;
  pitchModDepthHz: number;
  filterModDepthHz: number;
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

export function playPolySh101Event(
  context: AudioContext,
  when: number,
  parameters: ParameterBag,
  durationMs?: number,
): void {
  for (const plan of resolvePolySh101Voices(parameters, durationMs)) {
    playPolySh101Voice(context, when, plan, readString(readObject(parameters.lfo).waveform, "triangle"));
  }
}

export function resolvePolySh101Voices(parameters: ParameterBag, durationMs?: number): PolySh101VoicePlan[] {
  const oscillator = readObject(parameters.oscillator);
  const filter = readObject(parameters.filter);
  const envelope = readObject(parameters.envelope);
  const lfo = readObject(parameters.lfo);

  const rangeOffset = oscillatorRangeOffset(readString(oscillator.range, "8"));
  const transposeOffset = transposeOffsetFor(readString(parameters.transpose, "middle"));
  const tuneOffset = readNumber(parameters.tune, 0);
  const velocity = clampNumber(readNumber(parameters.velocity, 84) / 127, 0.02, 1);
  const gain = clampNumber(readNumber(parameters.gain, 1), 0, 1);
  const volume = clampNumber(readNumber(parameters.volume, 0.72), 0, 1);
  const durationSeconds = Math.max((durationMs ?? readNumber(parameters.durationMs, 180)) / 1000, 0.02);
  const cutoffControl = clampNumber(readNumber(filter.cutoff, 0.42), 0, 1);
  const resonance = clampNumber(readNumber(filter.resonance, 0.2), 0, 1) * 18;
  const envelopeAmount = clampNumber(readNumber(filter.envelopeAmount, 0.35), 0, 1);
  const filterModAmount = clampNumber(readNumber(filter.modulationAmount, 0.1), 0, 1);
  const keyboardTracking = clampNumber(readNumber(filter.keyboardTracking, 0.3), 0, 1);
  const attackSeconds = readEnvelopeSeconds(envelope.attackMs, 5);
  const decaySeconds = readEnvelopeSeconds(envelope.decayMs, 120);
  const sustain = clampNumber(readNumber(envelope.sustain, 0.35), 0, 1);
  const releaseSeconds = readEnvelopeSeconds(envelope.releaseMs, 90);
  const vca = readObject(parameters.vca);
  const usesGateVca = readString(vca.mode, "envelope") === "gate";
  const lfoRateHz = 0.15 + clampNumber(readNumber(lfo.rate, 0.22), 0, 1) * 18;
  const pitchModDepthHz = clampNumber(readNumber(oscillator.modulationAmount, 0.1), 0, 1) * 18;
  const pulseWidth = clampNumber(readNumber(oscillator.pulseWidth, 0.5), 0.05, 0.95);
  const sawGain = sourceGain(oscillator.sawLevel, oscillator.saw, 0.75);
  const pulseGain = sourceGain(oscillator.pulseLevel, oscillator.pulse, 0.6);
  const subGain = sourceGain(oscillator.subLevel, oscillator.sub, 0.55);
  const noiseGain = clampNumber(readNumber(oscillator.noise, 0.04), 0, 1);
  const subMode = readString(oscillator.subMode, "oneOctSquare");
  const subDivider = subMode === "oneOctSquare" ? 2 : 4;
  const subPulseWidth = subMode === "twoOctPulse" ? 0.25 : 0.5;
  const outputGain = velocity * gain * volume * 0.32;

  return readPitchList(parameters).map((pitch) => {
    const midi = pitchToMidiNumber(pitch) + rangeOffset + transposeOffset + tuneOffset;
    const frequencyHz = midiToFrequency(midi);
    const trackingRatio = 2 ** ((((midi - 48) / 12) * keyboardTracking));
    const cutoffHz = clampNumber(exponentialScale(cutoffControl, 45, 12_000) * trackingRatio, 35, 18_000);
    const filterPeakHz = clampNumber(cutoffHz * (1 + envelopeAmount * 5), cutoffHz, 19_000);
    return {
      pitch,
      frequencyHz,
      pulseWidth,
      subFrequencyHz: frequencyHz / subDivider,
      subPulseWidth,
      sawGain,
      pulseGain,
      subGain,
      noiseGain,
      cutoffHz,
      filterPeakHz,
      resonance,
      attackSeconds,
      decaySeconds,
      sustainGain: usesGateVca ? 1 : sustain,
      releaseSeconds,
      durationSeconds,
      outputGain,
      lfoRateHz,
      pitchModDepthHz,
      filterModDepthHz: filterModAmount * 2800,
    };
  });
}

function playPolySh101Voice(
  context: AudioContext,
  when: number,
  plan: PolySh101VoicePlan,
  lfoWaveform: string,
): void {
  const filter = context.createBiquadFilter();
  const amp = context.createGain();
  const stopAt = when + plan.durationSeconds + plan.releaseSeconds + 0.06;
  const sourceStops: Array<{ stop: (when?: number) => void }> = [];

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(plan.cutoffHz, when);
  filter.frequency.linearRampToValueAtTime(plan.filterPeakHz, when + plan.attackSeconds);
  filter.frequency.linearRampToValueAtTime(plan.cutoffHz, when + plan.attackSeconds + plan.decaySeconds);
  filter.Q.setValueAtTime(plan.resonance, when);

  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, plan.outputGain), when + Math.max(plan.attackSeconds, 0.002));
  amp.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, plan.outputGain * plan.sustainGain),
    when + plan.attackSeconds + plan.decaySeconds,
  );
  amp.gain.setValueAtTime(Math.max(0.0001, plan.outputGain * plan.sustainGain), when + plan.durationSeconds);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + plan.durationSeconds + plan.releaseSeconds);

  filter.connect(amp);
  amp.connect(context.destination);

  const lfo = createLfo(context, when, stopAt, lfoWaveform, plan.lfoRateHz);
  if (lfo !== null && plan.filterModDepthHz > 0) {
    const filterMod = context.createGain();
    filterMod.gain.setValueAtTime(plan.filterModDepthHz, when);
    lfo.connect(filterMod);
    filterMod.connect(filter.frequency);
  }

  if (plan.sawGain > 0) {
    sourceStops.push(connectOscillator(context, filter, when, stopAt, {
      frequencyHz: plan.frequencyHz,
      gain: plan.sawGain,
      type: "sawtooth",
      lfo,
      pitchModDepthHz: plan.pitchModDepthHz,
    }));
  }

  if (plan.pulseGain > 0) {
    sourceStops.push(connectOscillator(context, filter, when, stopAt, {
      frequencyHz: plan.frequencyHz,
      gain: plan.pulseGain,
      periodicWave: createPulseWave(context, plan.pulseWidth),
      lfo,
      pitchModDepthHz: plan.pitchModDepthHz,
    }));
  }

  if (plan.subGain > 0) {
    sourceStops.push(connectOscillator(context, filter, when, stopAt, {
      frequencyHz: plan.subFrequencyHz,
      gain: plan.subGain,
      periodicWave: createPulseWave(context, plan.subPulseWidth),
      lfo,
      pitchModDepthHz: plan.pitchModDepthHz / 2,
    }));
  }

  if (plan.noiseGain > 0) {
    sourceStops.push(connectNoise(context, filter, when, stopAt, plan.noiseGain));
  }

  if (sourceStops.length === 0) {
    sourceStops.push(connectOscillator(context, filter, when, stopAt, {
      frequencyHz: plan.frequencyHz,
      gain: 0.5,
      type: "sawtooth",
      lfo,
      pitchModDepthHz: plan.pitchModDepthHz,
    }));
  }
}

function connectOscillator(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  stopAt: number,
  options: {
    frequencyHz: number;
    gain: number;
    type?: OscillatorType;
    periodicWave?: PeriodicWave;
    lfo: OscillatorNode | null;
    pitchModDepthHz: number;
  },
): OscillatorNode {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  if (options.periodicWave !== undefined) {
    oscillator.setPeriodicWave(options.periodicWave);
  } else {
    oscillator.type = options.type ?? "sawtooth";
  }

  oscillator.frequency.setValueAtTime(options.frequencyHz, startAt);
  gain.gain.setValueAtTime(options.gain, startAt);
  oscillator.connect(gain);
  gain.connect(destination);

  if (options.lfo !== null && options.pitchModDepthHz > 0) {
    const pitchMod = context.createGain();
    pitchMod.gain.setValueAtTime(options.pitchModDepthHz, startAt);
    options.lfo.connect(pitchMod);
    pitchMod.connect(oscillator.frequency);
  }

  oscillator.start(startAt);
  oscillator.stop(stopAt);
  return oscillator;
}

function connectNoise(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  stopAt: number,
  gainValue: number,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const frameCount = Math.max(1, Math.ceil((stopAt - startAt) * context.sampleRate));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  source.buffer = buffer;
  gain.gain.setValueAtTime(gainValue, startAt);
  source.connect(gain);
  gain.connect(destination);
  source.start(startAt);
  source.stop(stopAt);
  return source;
}

function createLfo(
  context: AudioContext,
  startAt: number,
  stopAt: number,
  waveform: string,
  rateHz: number,
): OscillatorNode | null {
  const oscillator = context.createOscillator();
  oscillator.type = lfoOscillatorType(waveform);
  oscillator.frequency.setValueAtTime(rateHz, startAt);
  oscillator.start(startAt);
  oscillator.stop(stopAt);
  return oscillator;
}

function createPulseWave(context: AudioContext, dutyCycle: number): PeriodicWave {
  const harmonics = 48;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);

  for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
    imag[harmonic] = (2 / (harmonic * Math.PI)) * Math.sin(harmonic * Math.PI * dutyCycle);
  }

  return context.createPeriodicWave(real, imag, { disableNormalization: false });
}

function readPitchList(parameters: ParameterBag): string[] {
  if (Array.isArray(parameters.pitches)) {
    const pitches = parameters.pitches.filter((value): value is string => typeof value === "string");
    if (pitches.length > 0) {
      return pitches;
    }
  }
  return [readString(parameters.pitch, "C3")];
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

export function pitchToFrequency(pitch: string): number {
  return midiToFrequency(pitchToMidiNumber(pitch));
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function oscillatorRangeOffset(range: string): number {
  if (range === "16") return -12;
  if (range === "4") return 12;
  if (range === "2") return 24;
  return 0;
}

function transposeOffsetFor(transpose: string): number {
  if (transpose === "low") return -12;
  if (transpose === "high") return 12;
  return 0;
}

function sourceGain(level: ParameterValue | undefined, enabled: ParameterValue | undefined, fallback: number): number {
  if (enabled === false) return 0;
  return clampNumber(readNumber(level, fallback), 0, 1);
}

function lfoOscillatorType(waveform: string): OscillatorType {
  if (waveform === "square") return "square";
  if (waveform === "sawtooth") return "sawtooth";
  return "triangle";
}

function readEnvelopeSeconds(value: ParameterValue | undefined, fallbackMs: number): number {
  return clampNumber(readNumber(value, fallbackMs), 0, 10_000) / 1000;
}

function exponentialScale(value: number, min: number, max: number): number {
  return min * (max / min) ** value;
}

function readObject(value: ParameterValue | undefined): ParameterBag {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
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
