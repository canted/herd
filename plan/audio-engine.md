# Audio Engine Plan

This document defines the planned audio engine variants for Herd and how the project should decide when to move from one variant to the next.

## Principle

Herd should keep the Composition model engine-agnostic.

Compositions should describe Instruments, Patterns, Step Events, Parameters, modulation, assets, and required capabilities. They should not depend on a specific implementation such as native Web Audio nodes, JavaScript AudioWorklet processors, or Rust/WASM internals.

The runtime can then choose the best available engine path for the current device and Performance. If a device cannot support a requested capability, the client should report a degraded capability state and use the Composition's fallback behavior.

## Current Recommendation

Start with **Variant 1: Web Audio V1** for production playback.

Build **Variant 2: WASM Prototype** as a bounded validation path for positioning and custom DSP. Do not make it the default playback engine until real-device testing proves a product-critical benefit.

Defer **Variant 3: Full WASM Engine** until Herd has measured evidence that native Web Audio plus targeted kernels cannot support the product.

## Shared Responsibilities

All variants need the same high-level runtime responsibilities:

- translate synchronized server time into local audio time
- schedule Step Events ahead of playback
- create and release Voice-local Instrument state
- load and decode audio assets
- apply parameter locks and modulation
- expose audio health to the Host dashboard
- support fallback behavior when a capability is unavailable
- avoid replaying stale events after suspension, backgrounding, or late messages

The implementation can change by variant, but the product behavior should remain stable.

## Capability Profile

Each client should report an audio capability profile during setup and whenever the audio state changes.

Recommended fields:

```json
{
  "audioContext": "running",
  "sampleRate": 48000,
  "webAudio": true,
  "audioWorklet": true,
  "wasm": true,
  "sharedArrayBuffer": false,
  "crossOriginIsolated": false,
  "micPermission": "granted",
  "motionPermission": "unknown",
  "engineVariant": "webAudioV1",
  "degradedReasons": []
}
```

The Host dashboard should use this profile to distinguish:

- ready
- ready with degraded capabilities
- blocked

## Variant 1: Web Audio V1

Variant 1 is the default production path for early Herd.

It uses native Web Audio nodes with TypeScript orchestration. It should not require Rust, WASM, SharedArrayBuffer, or a custom full-engine AudioWorklet.

### Intended Scope

Variant 1 should support:

- scheduled sample playback
- polyphonic SH-101-style synth voices
- SH-101-style synth controls: saw, pulse, sub oscillator, noise, pulse width, LFO, filter, envelope, VCA, and glide/portamento
- gain envelopes
- pitch and tuning
- filters
- simple effect sends or simple effects
- parameter locks
- boundary-based modulation
- motion-driven shaker Step Events where motion permission is available
- synchronized visual/audio scheduling against the shared transport

Variant 1 may use:

- `AudioBufferSourceNode` for sample playback
- `OscillatorNode` or `PeriodicWave` for SH-101-style synth oscillators
- `GainNode` for amplitude and envelopes
- `BiquadFilterNode` for filter behavior
- `AudioParam` automation for scheduled parameter changes

### Runtime Shape

```text
Composition package
  -> TypeScript Composition runtime
  -> clock/transport mapper
  -> lookahead scheduler
  -> Web Audio graph
  -> device output
```

The scheduler should place events far enough ahead to survive ordinary main-thread jitter while preserving musical timing. The current timing model recommends 100-250 ms audio lookahead; the exact value must be tested on target phones.

### Benefits

- fastest path to a working product
- lowest toolchain complexity
- uses browser-optimized native audio nodes
- supports the initial sampler/polyphonic SH-101-style synth scope
- keeps authoring UI and Composition semantics moving while audio requirements are still fluid
- easier to debug than AudioWorklet/WASM on mobile

### Costs

- scheduler and graph lifecycle still need careful implementation
- audio unlock, suspension, backgrounding, and mobile browser behavior remain hard
- custom DSP is limited to what native nodes can express cleanly
- heavy analysis work such as chirp correlation should not run on the main thread

### Risks And Unknowns

- Uncertain: native Web Audio scheduling may or may not be reliable enough under visual/UI load on target phones.
- Uncertain: mobile browser behavior may force an AudioWorklet for some future processor, but this should be proven with testing.
- Uncertain: the real product may demand audio features beyond the initial sampler/polyphonic SH-101-style synth scope.

### Validation

Variant 1 must be tested with:

- several simultaneous Voices
- repeated sample triggering
- UI prompts during playback
- visual rendering during playback
- phone lock and resume
- audio context suspension and resume
- late join
- missed event recovery
- low-end Android and iOS Safari devices

## Variant 2: WASM Prototype

Variant 2 is a targeted validation path. It is not a full audio engine.

The goal is to learn whether Rust/WASM materially improves a specific product-critical workload.

### Intended Scope

Variant 2 should keep Variant 1 as the playback path and add one or more bounded kernels:

- chirp generation
- chirp detection
- cross-correlation over recorded scan windows
- arrival-time estimation
- one custom DSP processor that native Web Audio cannot express

The first WASM prototype should prefer analysis outside the real-time render path unless the experiment specifically needs render-thread behavior.

Recommended first positioning shape:

```text
Microphone input
  -> Web Audio capture
  -> scan-window buffer
  -> Worker or WASM Worker analysis
  -> detection/confidence results
  -> server measurement upload
```

Use AudioWorklet only if the worker/offline analysis path cannot meet the positioning timing requirement or if sample-accurate capture behavior requires it.

### Benefits

- tests Rust/WASM value without committing the whole product to it
- isolates the highest-plausibility WASM workload: positioning DSP
- lets the team compare JS, native Web Audio, worker, AudioWorklet, and WASM approaches
- avoids freezing the full Instrument engine before the Composition model stabilizes

### Costs

- requires Rust/WASM build tooling
- requires browser/device integration testing
- creates a second language/runtime boundary
- may require special deployment headers if SharedArrayBuffer becomes necessary
- needs explicit telemetry for load failures, processing failures, timing, and confidence

### Risks And Unknowns

- Uncertain: WASM may not beat optimized JavaScript for the chosen workload once memory transfer and boundary overhead are included.
- Uncertain: the bottleneck may be microphone/speaker hardware, room acoustics, or browser policy rather than compute.
- Uncertain: browser APIs may not expose enough precise latency information to validate acoustic positioning cleanly.
- Uncertain: cross-origin isolation may conflict with hosting, third-party scripts, asset CDNs, embeds, or analytics.

### Validation

The prototype should compare at least two approaches:

- JavaScript worker analysis
- Rust/WASM worker analysis

If needed, add:

- JavaScript AudioWorklet
- Rust/WASM AudioWorklet

Measure:

- scan processing time
- detection confidence
- false positives
- arrival-time stability
- memory use
- startup/load failure
- battery and thermal behavior where practical
- impact on playback and visuals during scan windows

The prototype should run on real iOS Safari and Android Chrome devices before influencing the production architecture.

### Decision Gate

Move a WASM kernel toward production only if it beats the simpler implementation on a product-critical metric.

Examples of valid gates:

- worker JavaScript cannot finish scan analysis before the effect cue deadline, but WASM can
- native Web Audio cannot generate or detect the needed signal reliably, but the WASM path can
- AudioWorklet is required to preserve timing under measured load
- the positioning feature is confirmed as launch-critical or a primary differentiator

Do not proceed based only on theoretical performance.

## Variant 3: Full WASM Engine

Variant 3 is a future architecture where most audio rendering logic lives in a Rust/WASM engine, usually behind an AudioWorklet boundary.

This is not recommended for v1.

### Intended Scope

A full WASM engine could own:

- sample voice allocation
- sample playback and interpolation
- envelopes
- oscillators
- filters
- effects
- modulation-rate processing
- parameter smoothing
- mixer/routing
- advanced custom DSP
- possibly positioning signal generation/detection

TypeScript would still own:

- Composition loading
- authoring UI
- performance state
- server communication
- Host dashboard
- permission prompts
- fallback decisions
- high-level scheduling and engine commands

### Runtime Shape

```text
Composition runtime
  -> engine command queue
  -> AudioWorkletNode
  -> Rust/WASM processor
  -> audio output
```

If the engine requires low-copy bidirectional transfer, it may need a SharedArrayBuffer-backed ring buffer and cross-origin isolation.

### Benefits

- strongest long-term path for complex custom audio behavior
- can centralize DSP in one deterministic core
- may make advanced instruments/effects easier to test outside the browser
- can support future native or offline render targets if the project needs them

### Costs

- highest implementation cost
- highest QA cost
- specialized Rust/audio/browser expertise required
- harder debugging on mobile
- more complicated build and deployment
- possible cross-origin isolation requirement
- engine behavior becomes a long-term compatibility contract for existing Compositions

### Risks And Unknowns

- Uncertain: full-engine WASM may not improve v1 product value.
- Uncertain: boundary overhead may make frequent parameter and event updates harder than native Web Audio automation.
- Uncertain: the team may not have enough specialized ownership to maintain the engine safely.
- Uncertain: browser and operating system limits may still dominate reliability even with a custom engine.
- Uncertain: a full custom engine may duplicate browser-native nodes that are already optimized.

### Decision Gate

Do not start Variant 3 until all of these are true:

- Variant 1 has been tested on target devices and failed a defined product-critical threshold.
- Variant 2 has proven that targeted WASM solves a real measured bottleneck.
- The first public product experience requires capabilities that native Web Audio and targeted kernels cannot provide.
- The team has an owner for Rust/WASM audio maintenance.
- Deployment can support any required headers and asset constraints.
- The Composition schema has stabilized enough that engine primitives are unlikely to churn.

## Variant Comparison

| Variant | Default use | Main benefit | Main cost | Recommended status |
| --- | --- | --- | --- | --- |
| Web Audio V1 | baseline playback | fastest reliable product path | limited custom DSP | build now |
| WASM Prototype | positioning/custom DSP validation | evidence without full commitment | tooling and test complexity | prototype selectively |
| Full WASM Engine | advanced future audio platform | maximum custom engine control | high build, QA, maintenance cost | defer |

## Product Requirements Before Engine Expansion

Before moving beyond Variant 1, answer:

- Is acoustic positioning required for launch?
- What synchronization accuracy is required for the first compelling Performance?
- What minimum iOS and Android versions are supported?
- Can the product require HTTPS and cross-origin isolation if needed?
- What fallback is acceptable when a phone cannot run positioning or advanced audio?
- Are sampler and a polyphonic SH-101-style synth enough for initial creators?
- Who owns Rust/WASM audio code long term?

## Authoring Implications

The authoring UI should express audio needs as capabilities, not implementation names.

Examples:

- `requiresAudio`
- `requiresMic`
- `requiresPositioning`
- `requiresAdvancedDSP`
- `supportsFallbackVoice`
- `supportsVisualOnlyFallback`

Avoid exposing choices such as "Rust engine" or "WASM engine" to creators unless the distinction becomes artistically meaningful.

Validation should warn when a Composition depends on a capability without a fallback.

## Fallback Behavior

If the selected engine path is unavailable:

- keep the Participant in the Performance when possible
- preserve clock sync and visual behavior
- use simpler Instrument behavior if defined
- enter visual-only or silent fallback if necessary
- report degraded state to the Host dashboard
- do not replay stale audio after recovery

The correct fallback is defined by the Composition and Performance policy, not by the audio engine alone.
