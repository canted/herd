# Scope Decision: Rehearsal Vertical Slice

## Context Capsule

- Request: Use `scope-decision` at standard depth to turn the current Herd planning, interaction design, and usability review into a buildable slice.
- Current recommendation: Build a fixture-driven rehearsal vertical slice: shared schema/types, minimal session server, Participant mobile client, Host setup/lobby/readiness/start/stop/logs, and enough runtime execution for timed Step Events, Instrument Triggers, Visualizer Triggers, and one UI choice.
- Confidence: medium-high.
- Artifact depth: standard.
- Evidence used: Observed docs in `/plan`, especially `usability-review.md`, `phased-implementation.md`, `interaction-design/*.md`, `composition-schema.md`, `timing-model.md`, `authority-model.md`, `audio-engine.md`, `host-dashboard.md`, `privacy-and-consent.md`, `failure-modes.md`, and `participant-assignment.md`.
- Key assumptions: First implementation should prove real phone timing, audio unlock, synchronized local playback, Host readiness, and basic recovery before full authoring or acoustic positioning. Normal public notice is physical signage, not app-based consent.
- Blocking questions: Minimum supported Host viewport is still undecided. Public flashing/motion safety review is still needed before public deployment. The exact Web Audio instrument subset for the first fixture must be chosen before implementation.
- Decisions already made: Composition and Performance are separate; clients execute locally; server coordinates state and clock; Host owns live controls; most choices apply at musical boundaries; Step Events use Instrument Triggers, Visualizer Triggers, and Parameter Locks; Step Events have Lock Capture only; Modulation Mode belongs to Instruments and Visualizers.
- Constraints discovered: Mobile browser audio unlock, clock sync, asset loading, foreground/background behavior, recoverable network gaps, degraded permissions, and Host emergency stop must be in the first usable slice.
- Escalations: Acoustic positioning, full authoring, diagnostic recording, public deployment safety, and full polyphonic SH-101 authoring controls should remain gated.
- Suggested next skills: `delivery-planning`; use `feasibility-review` only if the first slice expands to acoustic positioning, advanced Web Audio timing guarantees, or full synth implementation.

## Scope Summary

The first buildable slice is a **rehearsal vertical slice** that runs a predefined fixture Composition on multiple phones under Host control.

It should let a Host create a Performance, show a QR code, admit Participants, see readiness, start a scheduled transport, observe basic live state, and stop the Performance. Participants should join from QR, unlock audio, synchronize clocks, enter a holding state, receive the fixture Composition, locally schedule Step Events, show visuals, play a minimal audio event, respond to one UI choice, and recover from common interruptions.

This is not yet the full public product, full authoring environment, or positioning system. It is the smallest slice that tests the core product promise: many web clients acting together as a timed sound/light system with observable live control.

## In Scope

| Requirement | Why Included | Acceptance Criteria | Source |
| --- | --- | --- | --- |
| Shared Composition fixture schema/types | Needed before runtime, Host, and Participant can agree on Programs, Voices, Patterns, Step Events, and assets. | A fixture validates deterministically and includes at least two Programs, one Voice, one Pattern, Step Events, one Instrument Trigger path, one Visualizer Trigger path, and one UI choice. | `composition-schema.md`, `phased-implementation.md` |
| Minimal fixture package loading | Proves clients can receive and execute the same Composition package. | Participant loads selected fixture and reports loaded/failed asset state to server. | `phased-implementation.md`, `audio-engine.md` |
| Session server with join code | Required for real multi-phone rehearsal. | Host creates session; server issues hard-to-guess join code; Participants join via QR/link; invalid/closed sessions fail clearly. | `authority-model.md`, `privacy-and-consent.md` |
| WebSocket membership and state reports | Required for readiness, health, and recovery. | Server tracks Participants and receives clock, audio, visibility, permission, asset, Voice, Program cursor, and heartbeat state. | `authority-model.md`, `host-dashboard.md` |
| Clock sync and transport mapping | Core technical risk and prerequisite for synchronized playback. | Each client reports offset, RTT, jitter, confidence, and last sync; Host readiness classifies poor sync as degraded or blocked. | `timing-model.md`, `phased-implementation.md` |
| Scheduled start protocol | Needed to begin together without server-triggering every event. | Host requests start; server sends `prepareStart`; clients confirm; server sends `startConfirmed`; late messages rejoin current transport rather than replay stale events. | `authority-model.md`, `timing-model.md` |
| Participant QR join and lightweight entry | Core Participant path. | Participant sees Performance name, one-line phone role, privacy/device details link, and one primary begin/audio action. No normal in-app consent checkbox. | `02-participant-mobile-client.md`, `privacy-and-consent.md` |
| Physical notice copy placeholder | Needed because notice is physical signage, not app-based consent. | Repo includes public notice copy for the QR sign; app links to matching privacy/device details. | `privacy-and-consent.md`, `usability-review.md` |
| Audio unlock and capability check | Mobile browser requirement and readiness dependency. | Participant can unlock audio; failure is visible locally and in Host readiness. | `failure-modes.md`, `02-participant-mobile-client.md` |
| Minimal Web Audio V1 playback | Proves local timed sound. | At least one fixture Instrument Trigger produces audible scheduled output on supported mobile browsers after unlock. | `audio-engine.md`, `phased-implementation.md` |
| Minimal Visualizer output | Proves phone-as-light-tile behavior. | At least one Visualizer Trigger changes full-screen visual output at scheduled transport time. | `experience.md`, `authoring-ui.md` |
| Step Event runtime execution | Validates current event model before authoring. | Runtime executes Step Events with optional Instrument Trigger, optional Visualizer Trigger, and Parameter Locks from fixture data. | `glossary.md`, `composition-schema.md`, `authoring-ui.md` |
| One UI Device prompt and choice | Proves participant-driven state. | Fixture shows one prompt with two choices; choice receives immediate acknowledgment and applies at `patternLoopEnd` or configured boundary. | `authority-model.md`, `02-participant-mobile-client.md` |
| Participant holding, live, recovery, and ending states | Required for a complete rehearsal path. | Participant reaches holding, enters live, can recover from audio suspension or reconnect, and sees an ending state. | `failure-modes.md`, `06-state-matrices.md` |
| Host setup and lobby | Required for rehearsal operation. | Host selects fixture, names session, opens lobby, sees QR/join URL and Participant count. | `03-host-dashboard.md`, `host-dashboard.md` |
| Host readiness classification | Prevents blind starts. | Dashboard classifies `ready`, `degraded`, or `blocked` using asset, sync, audio, permission/capability, and participant count checks; top blockers and recommended action are visible. | `host-dashboard.md`, `usability-review.md` |
| Host start, stop, force holding, and compact logs | Minimum live control and recovery. | Host can start, stop, force holding, and see logged join/readiness/start/stop/fallback events with timestamps. | `host-dashboard.md`, `03-host-dashboard.md` |
| Basic live monitor | Lets Host know if rehearsal is working. | Dashboard shows elapsed time, connected Participants, Voice population, Program cursor distribution, audio/sync health, and latest choice counts. | `host-dashboard.md`, `03-host-dashboard.md` |
| Local development/testing harness | Keeps the slice testable. | Automated tests cover fixture validation and deterministic expected event timeline; manual checklist covers two or more real phones. | `phased-implementation.md`, `usability-review.md` |

## Out Of Scope

| Item | Why Excluded | Revisit Trigger |
| --- | --- | --- |
| Full authoring UI | Too much surface area before runtime proves the model. | Runtime can execute fixture packages and the Step Event editor prototype is validated. |
| Composition browser/import/export/package UI | Not needed to prove rehearsal runtime if fixtures are local. | After fixture runtime passes and authors need non-JSON creation. |
| Full Program Sequencer editing | First slice can use predefined fixture sequence. | Authoring MVP begins. |
| Step Event editor UI | Important, but not required to prove runtime and Host/Participant rehearsal. | Begin Authoring vertical slice. |
| Step Event Lock Capture UI | Belongs to authoring prototype, not runtime rehearsal. | Step Event editor prototype begins. |
| Instrument/Visualizer Modulation Mode UI | Important but complex and target-owner scoped; defer until authoring prototype. | Authoring vertical slice includes one source/two targets. |
| Full polyphonic SH-101-style authoring controls | Synth design is product direction, but full control surface is not needed for the rehearsal slice. | Authoring/instrument editor scope begins. |
| Full sampler zone editor | Not needed for first timed sound. | Authoring MVP or asset-heavy fixture work begins. |
| Acoustic positioning integration | Technical and usability risk remains high; lab first. | Sonic Positioning Lab produces repeatable scan logs and fallback evidence. |
| Sonic Positioning Lab implementation | Valuable but separate from the first rehearsal runtime slice. | Start Phase 4 or run a parallel technical validation track. |
| WASM Worker or full WASM engine | Explicitly gated by measured need. | Web Audio V1 or JS Worker fails a product-critical threshold. |
| Diagnostic raw audio recording | Privacy/safety-sensitive and unnecessary for first rehearsal. | Separate diagnostic requirement with explicit Host and Participant consent. |
| Public deployment-ready consent/safety program | First slice can be rehearsal-focused. | Before public audience use. |
| Account management and persistent identity | Not needed for session-scoped rehearsals. | Product requires saved user identity or hosted creator accounts. |

## Deferred

| Item | Reason Deferred | Suggested Phase |
| --- | --- | --- |
| Authoring vertical slice | Needs runtime foundation and expert usability review first. | Phase 3 |
| Step Event editor with layer badges | UX-critical but should be prototyped after runtime proves the event model. | Phase 3 prototype |
| Lock Capture interaction | Requires Instrument/Visualizer controls to exist. | Phase 3 prototype |
| Target-owner Modulation Mode | Requires device editors and parameter model maturity. | Phase 3 prototype |
| Asset manager and package export | Fixture loading is enough for first runtime slice. | Phase 3 |
| Sonic Positioning Lab | Important risk, but separate from core rehearsal runtime. | Phase 4, possibly parallel after Phase 1 |
| Host calibration for positioning | Depends on lab results. | Phase 5 |
| Position-aware Visualizer behavior | Depends on positioning state quality. | Phase 5 |
| Advanced Host emergency controls | Minimum stop/holding is enough first; disable positioning/shaker/force Program can follow. | Phase 2b |
| Multi-surface rehearsal simulation | Useful once Host/Participant runtime exists. | Phase 2b or Phase 3 |
| Public event polish and safety review | Needs real rehearsal evidence. | Pre-public release gate |

## Prioritized Requirements

**Must**

- Fixture Composition schema/types validate deterministically.
- Host can create a session, open lobby, show QR/link, and see joined Participants.
- Participant can join, unlock audio, load fixture, sync clock, and reach holding.
- Host readiness shows `ready`, `degraded`, or `blocked` with top blockers and recommended action.
- Host can start scheduled playback and stop the Performance.
- Participants locally schedule fixture Step Events from shared transport.
- Fixture produces at least one scheduled audio event, one visual event, and one UI choice.
- Participant recovery skips stale events and rejoins current transport position.
- Compact event log records key session actions.

**Should**

- Host can force holding pattern.
- Host can see Program cursor distribution and Voice population.
- Participant can view privacy/device details from join screen.
- Degraded start warning includes audience-visible impact.
- Manual QA checklist covers iOS Safari and Android Chrome.

**Could**

- Late join during live Performance.
- Choice count aggregation in Host live view.
- Minimal visual-only fallback for audio failure.
- Basic support for two Voices in the fixture.
- Optional recruitment QR in holding mode, Host-enabled only.

**Will Not**

- Full authoring UI.
- Acoustic positioning integration.
- WASM engine work.
- Diagnostic recording.
- Account management.
- Public release claims.

## Acceptance Criteria

### Fixture And Runtime

- A fixture Composition validates against shared runtime schema with deterministic errors.
- Fixture includes Programs, Voices, Pattern, Step Events, Instrument Trigger, Visualizer Trigger, Parameter Locks, UI Device prompt, and Program progression.
- An automated fake-clock test produces the expected event timeline.
- Runtime does not require engine-specific fields in the saved Composition.

### Participant

- Participant opens a join URL and sees session name, lightweight phone-role copy, and privacy/device details link.
- Participant can begin and unlock audio through the minimum browser-required gesture count.
- Participant sees loading/checking states for assets, clock sync, audio, and capability status.
- Participant reaches ready holding state or a clear degraded/blocked state.
- Participant enters live state after `startConfirmed` and scheduled transport time.
- Participant sees a prompt, selects a choice, and receives immediate choice acknowledgment.
- Participant audio suspension shows an actionable resume prompt.
- Participant reconnect/resume rejoins current transport position without replaying stale Step Events.

### Host

- Host creates session from fixture, opens lobby, and displays QR/link.
- Host sees Participant count, ready/degraded/blocked summary, top blockers, and recommended action.
- Host readiness uses asset, clock, audio unlock, capability/permission, participant count, and Composition warning inputs.
- Host can request start, see pending confirmations, and enter live monitor.
- Host can stop Performance and force holding pattern.
- Host sees elapsed time, Voice population, Program cursor distribution, audio/sync health, and choice counts where available.
- Event log records lobby opened, Participant joined, ready state changes, start requested, start confirmed, stop, force holding, and disconnect.

### Error And Permission Cases

- Invalid session link has a clear error state.
- Failed asset load marks Participant degraded or blocked according to fixture requirements.
- Poor clock sync marks Participant degraded or blocked.
- Audio unlock failure is visible on Participant and Host.
- Motion/mic permissions are not requested unless the fixture requires them.
- If optional permission is denied and fallback exists, Participant remains in degraded state.
- If required permission is denied with no fallback, Participant is blocked and Host sees the reason.

### Accessibility And Safety

- Participant operational prompts remain readable over visuals.
- Participant prompt and recovery states can be announced by assistive tech.
- Host dashboard can operate key lobby/start/stop flows by keyboard.
- Status is not color-only.
- Physical notice copy exists for sound, flashing visuals, optional mic/motion use, no normal speech recording, and leaving by closing page.

## Tradeoffs

- **Fixture-first over authoring-first:** This avoids building editors for a runtime model that has not been proven on phones. It is acceptable because artists can still validate the core Performance behavior with curated fixtures.
- **Minimal audio instrument over full synth/sampler editing:** The first slice needs scheduled sound, not complete sound design. Full SH-101-style controls and sampler zones can follow once runtime behavior is stable.
- **Host readiness before full Host dashboard:** The Host needs confidence to start and stop more than comprehensive diagnostics. Deep health views can follow after basic rehearsal operation works.
- **Physical notice over in-app consent:** This reduces Participant friction and matches installation context. The tradeoff is that copy and placement need venue/legal review before public use.
- **No positioning in first slice:** Positioning is a separate technical and UX risk. Deferring it keeps the first slice focused on synchronized performance basics.
- **No Step Event editor yet:** Step Event semantics are in runtime fixtures only. This keeps scope small but requires the authoring prototype to be the next major UX validation item.

## Sequencing Decision

### Phase A: Foundation Fixture

- Shared TypeScript types and runtime validator.
- Fixture Composition package.
- Fake-clock event timeline tests.
- Minimal asset manifest and loading result shape.

### Phase B: Participant Runtime

- Join page, physical notice handoff copy, privacy/device details link.
- Audio unlock and capability profile.
- Clock sync and transport mapper.
- Web Audio V1 minimal Instrument Trigger execution.
- Visualizer Trigger execution.
- UI Device prompt and choice acknowledgment.
- Recovery for audio suspension and reconnect.

### Phase C: Session Server

- Session creation and join code.
- WebSocket membership.
- Composition fixture distribution.
- Client state reports.
- Start protocol.

### Phase D: Host Rehearsal Dashboard

- Setup and lobby.
- Readiness classification with top blockers.
- Start/stop/force holding.
- Live monitor basics.
- Compact event log.

### Phase E: Real-Device Rehearsal Gate

- Run on at least two real phones plus Host.
- Validate audio unlock, sync, scheduled start, timed audio/visual events, UI choice, stop, and recovery.
- Record failures into follow-up scope before authoring or positioning work.

## Escalations

- **Public notice and safety:** Physical signage copy, flashing visuals, motion prompts, and data-retention language need review before public deployment.
- **Minimum Host viewport:** Decide whether Host dashboard requires laptop/tablet and what happens on smaller screens.
- **Instrument subset:** Choose whether first fixture uses sampler playback, a bounded SH-101-style synth preset, or both.
- **Clock sync thresholds:** Define initial ready/degraded/blocked thresholds for offset, RTT, jitter, and confidence.
- **Emergency behavior:** Decide whether force holding is immediate or boundary-aligned for the first slice.
- **Permission policy:** Decide which permissions the first fixture requires. Avoid mic/motion in the first slice unless needed for validation.

## Product/Technical Decision Record

**Decision:** Build the rehearsal vertical slice first.

**Rationale:** This slice proves the core system behavior: real phones can join, sync, locally schedule timed sound/visual/UI events, and be controlled by a Host. It also creates the runtime foundation required for later authoring and positioning work.

**Alternatives considered:**

- **Authoring MVP first:** Rejected because authoring depends on a proven runtime and would multiply UI complexity before the basic Performance loop works.
- **Sonic Positioning Lab first:** Plausible as a parallel technical validation track, but not the main product slice because it does not prove the core Participant/Host Performance experience.
- **Full public Performance product first:** Rejected because public notice, safety, emergency controls, browser behavior, and positioning are not sufficiently validated.
- **Backend/runtime only:** Rejected because Host readiness and Participant recovery are product-critical and must be designed with the runtime, not added later.

**Scope boundary:** The slice ends when a Host can run a rehearsal fixture on real phones, observe readiness/live state, and recover or stop safely. Authoring, positioning integration, and public deployment polish are separate follow-on scopes.

