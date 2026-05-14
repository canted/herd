# Modulation System

This document defines how authored and runtime signals change device parameters.

## Principle

Herd should use an Elektron-like parameter-lock workflow with a Bitwig-like modulation interface.

Modulation Mode belongs to target-owning devices: Instruments and Visualizers. The author should be able to put an Instrument or Visualizer in Modulation Mode, select a source, and press the targeting button to see which controls on that device can be modulated. Each potential target should show the modulation amount, range, and source.

## Step Events And Parameter Locks

A Step Event is the sequencer-step object that stores authored data. It can contain:

- an Instrument Trigger, which sends an Instrument Sounding Event, roughly equivalent to MIDI Note On
- a Visualizer Trigger, which sends a Visualizer Display Event, the visual equivalent of Note On
- Parameter Locks for the Instrument and/or Visualizer

A Step Event can lock one or more Parameters for that event.

Example:

- step 4 changes pitch
- step 8 opens filter cutoff
- step 12 changes Cel HSBA color
- step 16 sends an Instrument Trigger and a Visualizer Trigger

Parameter locks are event-local and should be evaluated when the Step Event fires.

Instrument and Visualizer devices define default values. A Step Event can override those defaults for one event by locking pitch, velocity, duration, filter cutoff, Cel shape, saturation, decay, or any other exposed Parameter.

A Step Event can independently contain:

- an Instrument Trigger
- a Visualizer Trigger
- both an Instrument Trigger and a Visualizer Trigger
- neither trigger

A Parameter-only Step Event is valid. In that case, the Step Event changes one or more Parameters at a scheduled step without sending an Instrument Sounding Event or a Visualizer Display Event.

## Step Event Lock Capture

The authoring UI should support lock capture for fast Elektron-style editing:

1. The author selects a Step Event.
2. The author chooses to create a new lock.
3. The next touched or modified control on the Instrument or Visualizer is captured as the lock target.
4. The edited value becomes the Step Event's locked value.
5. The target control displays that the selected Step Event owns a lock for it.

This keeps parameter-lock creation tactile and avoids making the author search through long parameter-address menus for common edits.

Step Events do not have Modulation Mode. The Step Event editor has Lock Capture only. Modulation Mode belongs to Instruments and Visualizers because they own the controls that can become modulation targets.

## Continuous Or Scoped Modulation

A Modulation Source can affect a Parameter over a longer scope:

- Participant
- Voice
- Pattern
- Program
- Composition
- Performance

Examples:

- a UI choice shifts assigned Voice index
- room x-position changes delay time
- loop count increases visual brightness
- shaker velocity changes pitch
- server fallback mode disables positioning-dependent effects

## Parameter Types

All Modulation Sources output a normalized float in the range `-1..1`.

Targets remain typed. Each target Parameter defines how the incoming modulation value maps into its domain. This keeps modulation routing uniform while still allowing booleans, enums, HSBA colors, preset indexes, and references to behave correctly.

Parameters should declare type and valid values:

- `boolean`
- `integer`
- `float`
- `enum`
- `hsbaColor`
- `assetRef`
- `presetRef`
- `programRef`
- `voiceRef`
- `duration`
- `ratio`

Mapping behavior depends on the target type:

- float targets interpolate across a min/max range
- boolean targets use a threshold or polarity rule
- enum, preset, asset, Program, and Voice targets map the float to an index
- HSBA color targets expose hue, saturation, brightness, and alpha as separate modulatable channels
- hue wraps circularly; saturation, brightness, and alpha clamp to their valid ranges

## Modulation Routing

A modulation route connects a source to a target.

```json
{
  "source": "participant.choice.group",
  "target": "voice.assignment.index",
  "amount": 1,
  "mode": "add",
  "applyAt": "patternLoopEnd"
}
```

Recommended route fields:

- `source`
- `target`
- `amount`
- `mode`
- `range`
- `curve`
- `applyAt`
- `scope`
- `enabled`

## Combining Modulations

When multiple sources affect the same target, the Composition should define the combination policy.

Recommended policies:

- `replace`
- `add`
- `multiply`
- `min`
- `max`
- `clamp`
- `priority`

The default should be additive for numeric values and priority-based for enums, preset indexes, and Program references after the normalized modulation value has been mapped to the target domain.

## UI Choice As Modulation

A UI Device can expose choices that set Parameters.

Example:

- button A sets `choice.group = 0`
- button B sets `choice.group = 1`
- Voice assignment reads `choice.group`
- result applies at the next Pattern loop

This lets UI remain simple while still allowing the Composition to define what the choice means musically.

## Visibility In Authoring

In modulation mode, every modulatable control should show:

- whether it is modulated
- which source affects it
- amount or range
- application boundary
- whether the value is local, Voice-level, Program-level, or global

The author should not have to inspect raw JSON to understand why a value changes.
