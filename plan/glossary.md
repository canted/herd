# Glossary

This document defines the core nouns in Herd. These definitions are intentionally practical: each term should describe ownership, behavior, and the boundary between authoring-time and performance-time state.

## Composition

A Composition is the saved artistic work. It contains the Programs, Voices, device presets, Program sequencing rules, assets, and defaults needed to run a Performance.

A Composition is not itself a live event. It is a portable score that can be loaded by a Host and distributed to Participants. A Composition should be deterministic enough that clients can execute it locally once they share the same clock and Performance state, but it may include random or participant-driven behavior.

## Program

A Program is a named section or scene within a Composition. It is similar to a MIDI program change: moving to a new Program changes the active musical, visual, and interaction state.

A Program defines which Voices are available, what devices and presets those Voices use, and what conditions can cause a Participant's next Program to be queued. Programs are addressable by stable identifier so UI choices or progression rules can jump to them.

## Voice

A Voice is one participant role within a Program. A Program may define one to four Voices. Each Participant is assigned to exactly one active Voice at a time unless the Composition explicitly defines a special inactive or observer state.

A Voice owns the local device behavior for assigned Participants: Pattern contents, Instrument sound, Visualizer output, and any UI prompts for that role. Multiple Participants can share the same Voice, causing their devices to act as a coordinated section.

## Pattern

A Pattern is the time-based event generator for a Voice. It may be a step sequencer, Euclidean generator, shaker, or another generator type.

A Pattern produces Trigs over time. It defines loop length, tempo relationship, quantization, repetition count, and completion behavior. At the end of a Pattern loop or Pattern run, it may request Program progression, apply queued UI choices, or update modulation values.

## Trig

A Trig is a scheduled event emitted by a Pattern. It is the smallest authored musical/visual/control event.

A Trig can carry note parameters, Instrument parameter locks, Visualizer event data, UI event data, and modulation changes. A Trig is evaluated locally by the client against the current clock, Voice assignment, and active modulation state.

## Cel

A Cel is a visual event for a Visualizer. It is the visual equivalent of a note-like event.

A Cel may define parameter locks for HSBA color, shape, intensity, duration, motion, decay, screen placement, and how the event should evolve over a single trigger or across a Pattern or freely over time. A Cel can be generated directly by a Trig or derived from note and modulation data.

## Instrument

An Instrument is the sound-producing device for a Voice. It may be a sampler, synth, noise source, effect chain, or composite device.

An Instrument has authored parameters, optional sample or wavetable assets, and a runtime state. It receives Trigs and modulation values, then produces local audio on the Participant device.

## Audio Engine

The Audio Engine is the client-side implementation that turns Instrument state, Trigs, assets, and modulation into local sound.

The Composition should remain engine-agnostic. A device may use native Web Audio, targeted WASM kernels, or a future full WASM engine depending on capability and Performance policy.

## Visualizer

A Visualizer is the screen-output device for a Voice. It receives Cels, note-like events, modulation values, and optional positioning data, then renders visual output on the Participant device. It has base settings for HSBA color, shape, intensity, duration, motion, decay, screen placement, and how the event should evolve over a single trigger or across a Pattern or freely over time.

The Visualizer is intended to make each phone act as one pixel or tile in a room-scale display, while still supporting local effects on each device.

## UI Device

A UI Device is an authored interaction layer inside a Voice. It can show prompts, choices, text, symbols, buttons, sliders, or other simple controls at specified musical times.

UI Device output can set Parameters, queue Program changes, assign Participants to Voices, change repetition counts, or set flags that other devices read. Most UI choices should apply at quantized boundaries such as the next Pattern loop or Program transition.

## Performance

A Performance is a live session created from a Composition. It includes Participants, Host controls, server state, clock synchronization, lobby state, calibration data, Program cursor distribution, and runtime health information.

The Performance is the live execution context. It may vary from one run to another even when the same Composition is used.

## Participant

A Participant is a joined client device controlled by an audience member or performer. A Participant receives the Composition, synchronizes with the server clock, reports health and state, and locally executes the active Voice behavior.

Participants may be assigned to Voices by UI choice, randomization, position, host action, or Composition rules. If assignment fails, the default fallback Voice is Voice 1.

## Host

The Host is the operator who creates and controls a Performance. The Host selects the Composition, opens the lobby, starts calibration, begins the Performance, monitors health, and may intervene when necessary.

The Host does not normally schedule every musical event. The Host controls session-level state and exceptional actions such as start, stop, pause, Program override, calibration, and fallback modes.

## Beacon

A Beacon is a Participant or dedicated device that emits scheduled acoustic positioning signals. Other devices listen for those signals to estimate relative room layout.

Beacons are selected by the server and should usually be stationary or semi-stationary. A Beacon may also act as a listener and may be demoted if its signal or measured position becomes unreliable. Beacon positioning signals are often scheduled during setup, but a Composition can also request a fresh positioning scan from a Voice. The request is artistic/compositional; the server still owns the exact chirp schedule, beacon slots, and safety timing.

## Parameter

A Parameter is an addressable value that can affect device behavior. Parameters may belong to a Composition, Program, Voice, Pattern, Trig, Instrument, Visualizer, UI Device, Participant, or Performance.

Parameters have types, ranges, defaults, and rules for when changes take effect. A Parameter can be directly authored, changed by UI, changed by the server, or modified by one or more Modulation Sources.

## Modulation Source

A Modulation Source is a normalized float signal that changes one or more Parameters over time or at musical boundaries. Modulation Sources use the range `-1..1`; each target Parameter maps that value into its own typed domain.

Examples include UI choices, loop count, Participant assignment, random values, motion data, position data, clock phase, group state, server flags, and Pattern-generated values. Modulation Sources should be named and scoped so the author can see what can affect each Parameter.
