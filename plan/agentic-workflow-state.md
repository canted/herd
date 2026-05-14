# Agentic Workflow State

## Current Goal

Build out Herd from the durable specs into a fuller app, continuing beyond the rehearsal runtime slice.

## Current Recommendation

Continue from the authoring/composition, sampler rehearsal, local package, and positioning-lab milestone into real-device validation and deeper performance fidelity. The app can now create authored Compositions, package local media in `.herd.zip` archives, import those packages, launch them into rehearsal sessions, play authored sampler zones in the Participant runtime, and run a standalone simulated Sonic Positioning Lab workflow.

## Completed Phases

- Planning artifacts: interaction design, usability review, scope decision, delivery plan.
- Foundation runtime: TypeScript workspace, Composition schema/types, validator, fixture, deterministic timeline tests.
- Rehearsal vertical slice: Host dashboard, Participant client, in-memory session server, protocol/readiness package, minimal Web Audio/visual runtime.
- Authoring/composition tools MVP: Composition browser, Program Sequencer, vertical Voice stack, Step Sequencer up to 64 steps, trigger layers, Step Event editor, Lock Capture, Instrument/Visualizer/UI Device editors, modulation target capture, validation, local persistence, import/export, and preview.
- Authored Composition rehearsal integration: Authoring can create a Host rehearsal session with the active Composition; server validates/stores that Composition per session; Host and Participant receive the authored session package.
- Asset and sampler authoring metadata: asset import creates Composition asset references with decoded audio duration when available; sampler Instruments can define zones with asset, pitch, velocity, root key, gain, trim, and loop settings.
- Runtime sampler playback: Authoring embeds imported media as prototype data URL payloads in Composition metadata; Participant decodes embedded audio assets, reports asset readiness, and routes sampler Instrument events through AudioBuffer playback.
- Durable local package workflow: Authoring exports `.herd.zip` archives containing `composition.json` plus media files, imports the same archive format, rehydrates local media for rehearsal, and round-trips packages into Host/Participant sessions.
- Sonic Positioning Lab prototype: standalone controller app with session QR, device labels/roles, chirp profiles, simulated scan measurements, approximate relative layout preview, operator notes, and JSON evidence export.

## Active Phase

- Real-device positioning and timing validation:
  - Replace simulated lab measurements with real chirp emission, microphone capture, cross-correlation, and upload flow.
  - Validate mobile timing, sample-rate behavior, mic permission UX, and acoustic robustness on physical iOS/Android devices.

## Recently Completed Phase

- Authoring/composition tools MVP.
- Authored Composition rehearsal integration.
- Asset manager and sampler zone authoring.
- Runtime sampler playback for embedded authoring assets.
- Durable local `.herd.zip` package export/import.
- Simulated Sonic Positioning Lab prototype.

## Next Phase

- Real-device Sonic Positioning Lab client/protocol work, gated by physical-device testing.

## Blocked Items

- Public deployment readiness and legal/signage review remain outside the current implementation phase.
- Acoustic positioning accuracy, microphone capture behavior, and real-device mobile timing require physical iOS/Android devices in a real room before they can be called complete.

## Deferred Items

- Full modulation routing UI.
- Persistent backend storage/accounts.
- Public package storage and account-scoped asset libraries.
- Production acoustic-positioning solver and robust real measurement pipeline.

## Next Intended Action

Run real-device positioning and mobile timing validation, then implement the actual chirp capture/correlation path against measured device behavior.
