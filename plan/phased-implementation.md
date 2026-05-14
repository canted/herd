# Phased Implementation Plan

This document turns the Herd planning docs into an implementation sequence.

The goal is to get to a rehearsable system without prematurely committing to the most complex audio architecture. The app should be built around an engine-agnostic Composition runtime, with Web Audio V1 as the first production playback engine, a manual sonic positioning test environment as an early validation tool, and WASM work gated by measured need.

## Guiding Principles

- Keep the Composition model engine-agnostic.
- Build the smallest vertical system that can run real timed audio and visuals on real phones.
- Validate mobile browser timing and permissions before investing in full custom audio infrastructure.
- Treat sonic positioning as a separate technical risk that needs a manual test environment before product integration.
- Prefer observable degraded behavior over silent failure.
- Do not build the full WASM engine until the documented gates in `audio-engine.md` are met.

## Phase Summary

| Phase | Goal | Primary Output | Exit Gate |
| --- | --- | --- | --- |
| 0 | Project foundation | App scaffold, shared schema/types, fixture compositions | Fixtures validate and load deterministically |
| 1 | Core runtime | Participant client, server session, clock sync, Web Audio V1 scheduler | Phones can join and play a simple timed fixture |
| 2 | Host control | Lobby, readiness, start flow, health, emergency controls | Host can start, monitor, and stop a rehearsal session |
| 3 | Authoring MVP | Composition editor, asset packaging, validation, preview | Authored package round-trips into runtime |
| 4 | Sonic positioning lab | Manual test environment for beacon/listener scans | Real devices produce repeatable scan logs and exports |
| 5 | Positioning integration | Position state, fallbacks, effect cues, Host calibration UI | Position-aware fixture works with stale/unlocated fallback |
| 6 | Targeted WASM prototype | JS Worker vs WASM Worker comparison for DSP kernels | WASM proves or fails a product-critical metric |
| 7 | Full WASM engine decision | Decide whether to build a full AudioWorklet/WASM engine | Proceed only if evidence and ownership justify it |

## Phase 0: Foundation

Build the base project structure and shared domain model.

Deliverables:

- Frontend app scaffold.
- Realtime server scaffold.
- Shared TypeScript package for Composition types.
- JSON schema or equivalent runtime validator.
- Fixture Composition package format with relative assets and hashes.
- Deterministic test fixtures for Programs, Voices, Patterns, Step Events, Parameters, modulation routes, and Program sequencing.
- Basic import/export path for local fixture packages.

Reuse:

- `composition-schema.md`
- `glossary.md`
- `modulation-system.md`
- `participant-assignment.md`

Exit gate:

- A fixture Composition validates, loads, and produces the same expected runtime event timeline in automated tests.
- No audio engine implementation details leak into the saved Composition schema.

## Phase 1: Core Runtime And Web Audio V1

Build the first runnable participant experience around Web Audio V1.

Deliverables:

- Participant join page.
- Physical venue notice handoff, lightweight join screen, and audio unlock flow.
- Server session creation with join code.
- WebSocket session membership.
- Clock sync with offset, round-trip latency, jitter, confidence, and last-sync time.
- Transport mapper from server time to local transport position.
- Lookahead scheduler for Pattern Step Events.
- Web Audio V1 sampler and polyphonic SH-101-style synth.
- Basic Visualizer event output.
- UI Device prompts and choices.
- Capability profile reporting.
- Stale-event skipping after late messages, suspension, or resume.

Reuse:

- `authority-model.md`
- `timing-model.md`
- `audio-engine.md`
- `failure-modes.md`
- `privacy-and-consent.md`

Exit gate:

- Multiple phones can join a local session and start a simple fixture at a scheduled server time.
- The client reports audio state, clock sync state, permission state, and visibility state.
- A resumed or late client skips stale Step Events and rejoins at the current transport position.

## Phase 2: Host Control And Operational Readiness

Build enough Host dashboard behavior to run rehearsals.

Deliverables:

- Performance setup.
- Lobby with QR code and join URL.
- Participant list.
- Ready, degraded, and blocked classification.
- Asset download and audio unlock status.
- Clock sync health.
- Permission and capability health.
- Live Program cursor distribution.
- Voice population.
- Emergency stop.
- Force holding pattern.
- Disable positioning.
- Disable shaker sections.
- Force Program for all or selected Participants where allowed.
- Compact event log.

Reuse:

- `host-dashboard.md`
- `authority-model.md`
- `failure-modes.md`

Exit gate:

- A Host can create a session, admit devices, see readiness, start playback, observe health, and stop or degrade the Performance.
- Emergency actions are logged with timestamp and Host identity.

## Phase 3: Authoring MVP

Build authoring only after the runtime can execute fixture packages.

Deliverables:

- Composition browser.
- Program Sequencer editor.
- Program editor.
- Voice editor with a vertical Pattern, Instrument, Visualizer, and UI Device stack.
- Step sequencer Pattern editor.
- Minimal shaker Pattern editor.
- Sampler and polyphonic SH-101-style synth editors.
- Visualizer editor.
- UI Device prompt and choice editor.
- Modulation mode for the first supported targets.
- Asset manager for audio samples.
- Performance preview with simulated Participants.
- Continuous validation warnings and errors.

Reuse:

- `authoring-ui.md`
- `composition-schema.md`
- `modulation-system.md`

Exit gate:

- A user can author a small Composition without editing JSON directly.
- Exported packages validate and run in the participant runtime.
- Missing assets, invalid references, missing fallbacks, unsafe immediate jumps, and impossible assignments are surfaced before rehearsal.

## Phase 4: Manual Sonic Positioning Test Environment

Build this before productizing positioning in the full Performance flow.

The manual sonic positioning environment is a standalone lab mode for testing acoustic beacon/listener behavior on real phones. It should be useful even if the authoring UI and full Host dashboard are incomplete.

### Purpose

The environment should answer these questions with real evidence:

- Can target phones emit and detect the planned chirps?
- Which chirp bands, durations, gains, and guard intervals work in real rooms?
- How stable are arrival timestamps across iOS Safari and Android Chrome?
- Does JS Worker analysis meet the scan latency target?
- Does WASM Worker analysis improve a product-critical metric?
- How often do false positives, missed detections, multipath, and stale positions occur?
- What fallback behavior is needed when devices are unlocated?

### Non-Goals

This environment does not need:

- Full Composition authoring.
- Full Performance sequencing.
- Full room-scale visual effects.
- Full WASM audio engine.
- Production-grade solver UX.
- Account management.

It does need enough session control, logging, and export to support manual experiments.

### Components

#### Test Session Server

Responsibilities:

- Create a positioning test session.
- Generate a hard-to-guess join code.
- Track connected devices.
- Assign device roles: `beacon`, `listener`, `backupBeacon`, or `observer`.
- Broadcast scan schedules.
- Receive detection measurements.
- Store scan results for export.
- Run an optional first-pass layout solver.
- Keep raw audio out of server storage by default.

#### Test Controller UI

Runs on the operator laptop or tablet.

Required controls:

- Create test session.
- Show QR code and join URL.
- List connected devices.
- Rename devices with manual labels such as `north wall`, `table 1`, or `iPhone 13`.
- Assign beacon/listener roles.
- Select chirp profile.
- Set scan duration.
- Set beacon slot duration.
- Set guard interval.
- Set chirp gain.
- Set repeat count.
- Choose analysis mode: `jsWorker`, `wasmWorker`, or `compare`.
- Run one scan.
- Run repeated scans.
- Stop all audio immediately.
- Export results.

Required displays:

- Per-device permission state.
- Per-device audio state.
- Per-device sample rate.
- Per-device clock sync confidence.
- Per-device role.
- Current scan schedule.
- Detection table by listener and beacon.
- Confidence and SNR summary.
- Scan latency summary.
- Fresh, stale, and unlocated counts.
- Optional 2D solved layout preview.

#### Test Device Client

Runs on each phone.

Responsibilities:

- Join by QR/link.
- Show concise consent copy for sound and microphone use.
- Request microphone permission only when the test requires listener behavior.
- Unlock audio through user gesture.
- Report capability profile.
- Sync clock with server.
- Emit scheduled chirps when assigned as beacon.
- Record scan window when assigned as listener.
- Detect chirp arrivals locally.
- Upload measurements, not raw audio.
- Show current role, audio state, mic state, and latest scan result.
- Provide a local panic button to stop audio.

#### Measurement Export

Each export should include:

- Test session ID.
- Timestamp.
- Browser user agent.
- Device labels.
- Device roles.
- Sample rates.
- Clock sync stats.
- Chirp profile.
- Scan schedule.
- Per-listener/per-beacon detections.
- Arrival timestamps.
- Confidence.
- SNR.
- Peak width.
- Detected or missed flag.
- Analysis mode.
- Processing time.
- Optional solved coordinates.
- Operator notes.

Raw audio should not be included unless a separate diagnostic recording mode has explicit Host and Participant consent.

### Chirp Profile Controls

The first version should make these manually adjustable:

- Frequency band.
- Chirp duration.
- Chirp shape.
- Beacon code.
- Output gain.
- Slot duration.
- Guard interval.
- Scan window length.
- Number of repeated scans.
- Detection threshold.
- Minimum confidence threshold.
- Smoothing disabled/enabled.

The test environment should ship with named presets:

- `audible-short`
- `audible-robust`
- `near-ultrasonic-test`
- `noisy-room`
- `long-guard-reverb`

### Manual Test Workflows

#### Workflow 1: Quiet Room Baseline

1. Create a test session.
2. Join 4 to 6 phones.
3. Assign 3 or more stationary beacons.
4. Assign remaining phones as listeners.
5. Run a setup check.
6. Run 10 single scans.
7. Export results.
8. Record manual notes about room size and device placement.

Pass condition:

- Most listeners detect most beacon chirps with stable arrival timing and high confidence.

#### Workflow 2: Chirp Profile Comparison

1. Use the same device layout as the baseline.
2. Run each named chirp preset.
3. Export one result bundle per preset.
4. Compare detection rate, false positives, scan latency, and operator-perceived audibility.

Pass condition:

- At least one profile produces usable detections without being too disruptive for the intended room.

#### Workflow 3: Noisy Room

1. Start background music or installation-like audio.
2. Run the same scan profile used in baseline.
3. Increase guard interval and chirp duration if needed.
4. Export results.

Pass condition:

- Detection confidence drops gracefully.
- Bad scans are identifiable instead of producing misleading coordinates.

#### Workflow 4: Movement And Occlusion

1. Keep beacons stationary.
2. Move listener phones between scans.
3. Rotate phones.
4. Cover a microphone partially.
5. Put one listener in a pocket or behind a body.
6. Export results.

Pass condition:

- The system marks weak devices stale or unlocated rather than producing abrupt false positions.

#### Workflow 5: Beacon Stability

1. Run a baseline scan with stationary beacons.
2. Move one beacon.
3. Run repeated scans.
4. Observe whether self-consistency checks identify the unstable beacon.

Pass condition:

- The test environment makes unstable beacon measurements visible to the operator.

#### Workflow 6: JS Worker vs WASM Worker

1. Use a fixed room layout.
2. Run repeated scans in `jsWorker` mode.
3. Run repeated scans in `wasmWorker` mode.
4. Run repeated scans in `compare` mode if practical.
5. Export timing and detection metrics.

Pass condition:

- WASM only advances if it improves a defined product-critical metric enough to justify tooling and deployment cost.

### Minimum Acceptance Criteria For The Test Environment

The first useful version is complete when:

- 6 real phones can join the same test session.
- The operator can assign at least 3 beacons and 3 listeners.
- The operator can run one scheduled scan.
- Beacons emit in non-overlapping slots.
- Listeners upload per-beacon detection measurements.
- The controller shows detections, misses, confidence, SNR, and processing time.
- Results can be exported as a structured file.
- Raw audio is not uploaded by default.
- The operator can stop all beacon output immediately.

### Safety And Privacy Rules

- Use HTTPS/WSS for real device testing.
- Explain that microphone access is for detecting test chirps, not recording speech.
- Process raw microphone audio locally by default.
- Upload measurements only.
- Make diagnostic recording a separate explicit mode if ever added.
- Keep a visible stop-all-audio control in the controller.
- Keep a local stop button on each device.
- Avoid high-volume near-ultrasonic tests until real-device safety and audibility are checked.

## Phase 5: Positioning Integration

After the manual test environment produces useful evidence, integrate positioning into the product runtime.

Deliverables:

- Positioning capability requirements in Composition validation.
- Host calibration view for positioning.
- Beacon candidate selection.
- Scan scheduling owned by server.
- Measurement upload protocol.
- Relative layout solver.
- Position state per device: `fresh`, `stale`, `unlocated`.
- Position-aware modulation source.
- Position-aware Visualizer behavior.
- Non-spatial fallback effects.

Exit gate:

- A fixture Performance can request a scan, receive position state, trigger a position-aware effect, and degrade gracefully when scans fail.

## Phase 6: Targeted WASM Prototype

This phase should only target bounded kernels.

Candidate kernels:

- Chirp generation.
- Chirp detection.
- Cross-correlation.
- Arrival-time estimation.
- One custom DSP processor that Web Audio cannot express cleanly.

Rules:

- Keep Web Audio V1 as the default playback engine.
- Compare JS Worker and WASM Worker before considering AudioWorklet.
- Add AudioWorklet only if worker/offline analysis cannot meet timing requirements.
- Measure on real iOS Safari and Android Chrome devices.

Exit gate:

- WASM must beat the simpler implementation on a product-critical metric such as scan processing time, detection stability, or battery/thermal behavior.

## Phase 7: Full WASM Engine Decision

Do not start the full WASM engine as a normal phase unless the evidence supports it.

Required conditions:

- Web Audio V1 has failed a defined product-critical threshold.
- Targeted WASM has proven value on real devices.
- The first public product requires capabilities that Web Audio V1 plus targeted kernels cannot provide.
- The Composition schema and runtime command model are stable enough to become a compatibility contract.
- Deployment can support required headers and asset constraints.
- A long-term Rust/WASM audio owner exists.

If these conditions are not met, continue improving Web Audio V1 and targeted kernels.

## Cross-Cutting Work

### Observability

Add structured telemetry early:

- Clock sync offset, RTT, jitter, and confidence.
- Audio context state.
- Scheduling underruns and stale-event skips.
- Asset load and decode failures.
- Permission state.
- Network reconnects.
- Program cursor and Voice assignment.
- Positioning scan confidence and latency.
- Fallback mode transitions.

### Security And Privacy

Implement before real rehearsals:

- Host authentication.
- Session-scoped Participant IDs.
- Hard-to-guess join codes.
- Message validation by session, participant, scan ID, and Composition revision.
- Rate limits on joins and measurement uploads.
- Composition package validation.
- Asset type and size limits.
- No raw audio upload by default.
- Explicit diagnostic consent if raw audio is ever captured.

### Test Harnesses

Build these alongside the product:

- Fake-clock scheduler tests.
- Composition fixture conformance tests.
- Multi-client simulation.
- Engine behavior fixtures.
- Manual mobile QA checklist.
- Positioning export analysis scripts.

## Recommended First Milestone

The first milestone should be:

1. Schema fixtures.
2. Minimal server session.
3. Participant Web Audio V1 timed playback.
4. Host lobby/readiness/start/stop.
5. Manual sonic positioning test environment scaffold.

This milestone proves the core risks early: timed local playback on phones, realtime session coordination, permissions, and measurable sonic positioning behavior.
