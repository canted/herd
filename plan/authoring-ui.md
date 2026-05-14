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

Each Voice should show a vertical stack of four devices:

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

- configurable step count up to 64 steps
- loop length
- repetition count
- tempo
- per-step Step Events
- a compact 16-step row layout, with longer Patterns wrapping into additional rows
- editor layer toggles for Instrument Triggers, Visualizer Triggers, and Parameter Locks
- independent Instrument Trigger and Visualizer Trigger flags per Step Event
- Parameter-only Step Events that change parameters without sending an Instrument Sounding Event or Visualizer Display Event
- note parameters such as pitch, velocity, and duration when the Step Event has an Instrument Trigger
- Cel parameters such as shape, HSBA color, saturation, and decay when the Step Event has a Visualizer Trigger
- Instrument parameter locks
- Visualizer/Cel parameter locks
- probability or conditional triggers if needed later

In the Pattern editor, the Instrument Trigger and Visualizer Trigger toggles control whether the author is viewing and editing sounding/display triggers. If both trigger layers are off, the editor is focused on Parameter Locks. This should make it possible to program rhythm, visuals, and Parameter-only automation without conflating them.

A Step Event is the sequencer-step object that stores authored data. It can contain:

- an Instrument Trigger, which sends an Instrument Sounding Event, roughly equivalent to MIDI Note On
- a Visualizer Trigger, which sends a Visualizer Display Event, the visual equivalent of Note On
- Parameter Locks for the Instrument and/or Visualizer

Instrument and Visualizer devices should define default values. Step Event Parameter Locks override those defaults for a single event, in the manner of an Elektron parameter-lock workflow. A Step Event may contain an Instrument Trigger, a Visualizer Trigger, both, or neither. A Step Event with neither trigger is still valid when it carries one or more Parameter Locks.

The Step Event editor should support lock capture:

1. The author selects a Step Event.
2. The author chooses to create a new lock.
3. The next touched or modified control on the Instrument or Visualizer is captured as the target.
4. The edited value becomes the Step Event's locked value for that target.
5. The affected control visibly indicates that the selected Step Event has a lock.

Step Events do not have Modulation Mode. The Step Event editor only has Lock Capture for creating Parameter Locks. Modulation Mode belongs to Instruments and Visualizers because those devices own the modulation targets.

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
- polyphonic SH-101-style synth

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

The synth should model the Roland SH-101 interaction style while allowing polyphonic playback. It should keep the immediacy of a simple subtractive mono synth, but each Participant device can play multiple overlapping notes when the Pattern requires it.

Synth controls should include:

- VCO waveform mix for saw, pulse, sub oscillator, and noise
- pulse width
- pitch and tuning
- glide/portamento
- LFO rate and routing
- filter cutoff and resonance
- filter envelope amount
- VCA mode
- ADSR envelope
- gain

Instrument parameters should be available for Step Event Parameter Locks and modulation routing.

## Modulation

Modulation Mode belongs to the devices that own modulation targets: Instruments and Visualizers. It is not a Pattern editor mode, not a Step Event mode, and not a global source-browser mode.

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
