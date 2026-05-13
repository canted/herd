# Composition Schema

This document describes how a Herd Composition should be saved and loaded.

## Storage Model

A Composition is saved as a JSON document plus referenced asset files. Audio samples, images, custom wavetables, and other media should live beside the JSON in a composition package or project folder.

The JSON file is the source of truth for structure, sequencing, presets, device parameters, modulation routing, and asset references. Asset files are referenced by stable relative paths and content hashes where possible.

## Top-Level Shape

```json
{
  "schemaVersion": "0.1.0",
  "id": "composition-id",
  "name": "Composition Name",
  "metadata": {},
  "assets": [],
  "presets": {},
  "parameters": {},
  "programs": [],
  "programSequencer": {},
  "defaults": {}
}
```

## Program Sequencer

Program sequencing should live directly under the Composition as a `programSequencer`.

Programs should remain individually addressable sections. The Program Sequencer defines how those sections are normally ordered, when a section is considered complete, and which queued jumps or branching rules are allowed.

Program sequencing is evaluated per Participant by default. A Composition can opt into shared progression behavior, but independent Participant Program cursors are the base case.

This keeps the model flexible:

- A simple piece can use a linear sequence.
- A Voice-local UI Device can queue a jump to a named Program.
- A Program can be reused in multiple places.
- A Host can see and override the current sequence without editing the Program contents.
- Future graph or playlist behavior can be added without changing the Program definition.

Example:

```json
{
  "programSequencer": {
    "mode": "linear",
    "initialProgramId": "intro",
    "steps": [
      { "programId": "intro" },
      { "programId": "choose-group" },
      { "programId": "duet-a" },
      { "programId": "finale" }
    ],
    "transitionPolicy": {
      "defaultBoundary": "patternLoopEnd",
      "lateClientPolicy": "compositionRule"
    },
    "programSyncPolicy": {
      "mode": "independent"
    }
  }
}
```

## Programs

A Program is a named section of the Composition.

```json
{
  "id": "choose-group",
  "name": "Choose Group",
  "voices": [],
  "parameters": {},
  "completion": {
    "type": "patternRepetitions",
    "sourceVoiceId": "voice-1",
    "repetitions": 8,
    "onComplete": {
      "type": "advance"
    }
  }
}
```

Program completion can be controlled by:

- a fixed Pattern repetition count
- a forever loop
- a Host action
- a UI choice
- a server or Composition flag
- a rule based on Participant state

Most transitions should occur at a quantized boundary, usually the end of the current Pattern loop. Unless a shared progression policy is enabled, completion advances the local Participant Program cursor, not the entire room.

## Voices

Voice settings should be changeable per Program but easy to recall or inherit. The recommended model is:

- `voicePresets` define reusable Voice setups.
- A Program Voice can reference a preset.
- A Program Voice can override specific fields.
- Modulation can target preset slot indexes, device parameters, or override values.

```json
{
  "id": "voice-1",
  "name": "Green Triangle",
  "presetRef": "voice-preset-green",
  "pattern": {
    "presetRef": "pattern-preset-pulse",
    "overrides": {}
  },
  "instrument": {
    "presetRef": "instrument-preset-pluck",
    "overrides": {}
  },
  "visualizer": {
    "presetRef": "visualizer-preset-green-wash",
    "overrides": {}
  },
  "ui": {
    "templateRef": "ui-template-choice-basic",
    "overrides": {}
  }
}
```

## Presets And Templates

Use presets for sound, visual, and Voice behavior that should be reused exactly or with overrides.

Use UI templates for Voice-local interaction layouts and timing patterns that should be reused but commonly reworded or repointed.

Recommended preset groups:

- `voicePresets`
- `patternPresets`
- `instrumentPresets`
- `visualizerPresets`
- `effectPresets`

Recommended template groups:

- `uiTemplates`
- `promptTemplates`
- `choiceTemplates`

## Assets

Assets are referenced in the Composition JSON and stored alongside it.

```json
{
  "assets": [
    {
      "id": "sample-kick-soft",
      "type": "audio",
      "path": "samples/kick-soft.wav",
      "hash": "sha256-placeholder",
      "durationMs": 430
    }
  ]
}
```

Sampler Instruments should reference asset IDs, not raw paths. Preset slots can point to asset IDs and can be modulated by index.

## UI-Driven Program Jumps

A Voice-local UI Device can queue a Program as the next Program for that Participant by setting a runtime flag or Parameter.

Example:

```json
{
  "action": {
    "type": "queueProgram",
    "programId": "duet-a",
    "applyAt": "patternLoopEnd"
  }
}
```

A UI Device should not usually hard-jump immediately unless the Composition marks the action as safe for immediate application. The default should be queued application at a musical boundary.

## Positioning Scan Requests

A Composition may request a fresh acoustic positioning scan as part of a Program. This is a compositional event: the artist can place it just before a movement that needs fresh room layout and can include silence or sparse audio to make the scan reliable.

The Composition requests the scan; the server owns the exact chirp schedule, beacon slots, guard intervals, and fallback behavior.

Example:

```json
{
  "action": {
    "type": "requestPositioningScan",
    "scanProfile": "fresh-room-layout",
    "applyAt": "patternLoopEnd",
    "expectedDurationBeats": 4
  }
}
```

Clients should treat the scan window as a scheduled compositional section even though the infrastructure timing is server-coordinated.

## Random Values

Random values can be allowed to remain random for early prototypes. For authored repeatability, the schema should eventually support seeded randomness.

Recommended future model:

- Composition seed: stable across rehearsals or exports.
- Performance seed: chosen when a Performance starts.
- Participant seed: derived from Performance seed and Participant ID.
- Trig seed: derived from Pattern position.

This allows a Composition to feel alive while still making bugs, rehearsals, and archived Performances easier to reproduce.
