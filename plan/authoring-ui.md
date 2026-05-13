# Authoring UI Spec

This document describes the initial authoring interface for creating Herd Compositions.

## Product Goal

The authoring UI should let an artist build a room-scale participatory composition without editing JSON directly.

The interface should feel closer to an electronic music workstation than a slide editor. Elektron-style sequencing, parameter locks, device pages, and performance-minded controls are the strongest reference. Bitwig-style modulation visibility is the strongest reference for modulation editing.

## Primary Areas

The authoring app should have these primary areas:

- Composition browser
- Composition editor
- Program Sequencer
- Program editor
- Voice editor
- Pattern editor
- Instrument editor
- Visualizer editor
- UI Device editor
- Modulation mode
- Asset manager
- Performance preview

## Composition Browser

The Composition browser lists saved Compositions and supports:

- create
- duplicate
- rename
- import
- export
- package assets
- open in rehearsal mode
- start Performance from Composition

Each item should show name, last modified date, required assets, expected capabilities, and warnings.

## Composition Editor

The Composition editor is the top-level workspace.

It should show:

- Composition name and metadata
- Program Sequencer
- active Program
- global parameters
- preset library
- assets
- validation warnings

The author should always be able to answer: where am I in the piece, what Program am I editing, and what happens next?

## Program Sequencer

The Program Sequencer defines the default order of Programs.

Initial behavior should support:

- linear Program order
- drag reorder
- duplicate Program
- rename Program
- set initial Program
- set default transition boundary
- define Program completion rule
- queue or jump targets for UI actions

Later behavior can support branching graphs, reusable Program playlists, or conditional transitions.

## Program Editor

The Program editor defines one section of the Composition.

It should show:

- Program name and ID
- Program duration or completion rule
- active Voices
- Program-level parameters
- transition behavior
- warnings for unresolved assets, missing Voices, or invalid modulation

Programs should be addressable by name in UI action pickers, but stored by stable ID.

## Voice Editor

The Voice editor is the core working surface for a Program.

Each Voice should show four device lanes:

- Pattern
- Instrument
- Visualizer
- UI Device

A Voice can reference a Voice preset and expose per-Program overrides. The author should be able to copy, paste, save as preset, reset to preset, and detach from preset.

## Pattern Editor

The Pattern editor should support multiple Pattern types.

Initial Pattern types:

- step sequencer
- Euclidean generator
- shaker

The step sequencer should support:

- step count
- loop length
- repetition count
- tempo
- per-step Trigs
- note parameters
- Instrument parameter locks
- Cel parameter locks
- UI parameter locks
- probability or conditional triggers if needed later

The shaker Pattern should support:

- motion sensitivity
- directional-change detection
- quantization amount
- tempo, step count, & repetition count for coordination with step sequencers in other voices
- derived modulation sources such as intensity, step proximity, consistency
- fallback behavior when motion permission is unavailable

## Instrument Editor

The Instrument editor defines local sound generation.

Initial Instrument types:

- sampler
- basic synth

Sampler controls should include:

- A pitch & velocity sample zone mapping area 
  - like Logic Pro's sampler
  - x dimension is pitch mapped to a piano
  - y dimension is velocity
  - each zone defines an x and y range
- zone editor with:
  - sample slots
    - played by round robin cycling if more than 1 sample loaded here
  - sample asset picker
  - root key pitch
  - tuning
  - gain
  - sample start and end
  - looping controls
- envelope
- filter
- effect sends or simple FX

Synth controls should include:

- oscillator type
- pitch
- envelope
- filter
- gain

Instrument parameters should be available for Trig locks and modulation routing.

## Modulation

All Instruments and Visualizers will have 4 modulators. Each modulator outputs a normalized float in the range `-1..1` and has:

- Modulation source selector
- Modulation amount knob
- A "target" button that will enable Modulation Mode for that device

Enabling Modulation mode on an Instrument or Visualizer adds interface on all device controls

When active:
- modulatable controls are highlighted
- existing modulation targets are visible
- amount and range controls are shown
- invalid routes are flagged

The author should be able to choose a source, click a target, set the amount, and immediately preview the result.

## Visualizer Editor

The Visualizer editor defines local screen output.

It should support:

- background HSBA color
- Cel shape
- Cel HSBA color
- intensity
- duration
- decay
- placement
- motion
- blend behavior
- position-aware behavior
- fallback when position is unknown

The editor should preview both a single device and a simplified room grid.

## UI Device Editor

The UI Device editor defines prompts and interactions that appear during a Program.

UI Devices are Voice-local. To show the same prompt to multiple Voices, the author should copy the UI Device or use a shared UI template referenced by each Voice.

It should support:

- timed prompts
- text
- symbols or simple shapes
- choice buttons
- action mappings
- apply boundary
- visibility rules
- timeout behavior
- default choice

Actions should be simple but powerful:

- set Parameter
- queue Program
- assign Voice
- set flag
- change repetition count
- submit vote

The UI editor should make it obvious when an action applies immediately versus at the next musical boundary.

## Asset Manager

The Asset Manager tracks files used by the Composition.

It should support:

- import audio samples
- preview samples
- detect missing files
- replace assets
- show where an asset is used
- package Composition with assets
- remove unused assets

Compositions should reference assets by stable asset IDs, not direct path strings in device controls.

## Performance Preview

Performance preview lets the author test without a full room.

It should support:

- simulate multiple Participants
- assign simulated Participants to Voices
- preview independent and synchronized Program progression
- preview UI choices
- preview late join
- preview no mic
- preview no motion
- preview unknown position
- preview Program cursor distribution

This is essential because many Herd behaviors only make sense across many devices.

## Validation

The authoring UI should continuously validate:

- missing assets
- unresolved Program references
- invalid preset references
- invalid modulation targets
- impossible Voice assignment
- all Participants could fall back to Voice 1
- Pattern set to run forever with no exit
- UI action that jumps immediately when unsafe
- device requiring unavailable permissions with no fallback

Validation should distinguish warnings from errors. Errors block export or Performance start. Warnings allow rehearsal but should be visible.
