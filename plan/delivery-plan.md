# Delivery Plan: Rehearsal Vertical Slice

## Context Capsule

- Request: Use `delivery-planning` at standard depth for the current Herd scope.
- Current recommendation: Deliver a fixture-driven rehearsal vertical slice in staged increments: foundation schema/runtime, session server, Participant runtime, Host rehearsal dashboard, then real-device rehearsal validation.
- Confidence: medium. The product scope is clear, but the repo is currently planning-only, so framework, package layout, and test commands still need to be chosen.
- Artifact depth: standard.
- Evidence used: `scope-decision.md`, `usability-review.md`, `phased-implementation.md`, `composition-schema.md`, `timing-model.md`, `host-dashboard.md`, `audio-engine.md`, `failure-modes.md`, `privacy-and-consent.md`, and `interaction-design/*.md`.
- Key assumptions: First delivery is local/rehearsal-focused, not public deployment. Normal Participant notice is physical signage, with lightweight in-app device/privacy details. The first fixture avoids microphone, motion, and acoustic positioning unless explicitly added later. Step Events have Lock Capture only; Modulation Mode belongs to Instruments and Visualizers and is out of scope for this slice.
- Blocking questions: Which frontend/server stack should the initial scaffold use? What is the minimum supported Host viewport? What exact clock-sync thresholds define `ready`, `degraded`, and `blocked`? Should the first audible fixture use sampler playback, a bounded polyphonic SH-101-style synth preset, or both?
- Decisions already made: Build the rehearsal vertical slice first; defer authoring, positioning integration, WASM, account management, and public deployment consent/safety work. Step Events may include Instrument Triggers, Visualizer Triggers, and Parameter Locks. A Step Event can be parameter-only. Host readiness must show top blockers, audience-visible impact, and recommended action.
- Constraints discovered: Mobile browser audio unlock, local scheduling, clock sync, asset loading, foreground/background behavior, reconnect recovery, physical notice requirements, emergency stop/holding behavior, and accessibility for dark-room use all affect the first usable slice.
- Escalations: Public signage/legal review, flashing/motion safety, Host viewport support, Web Audio timing thresholds, emergency action semantics, and any microphone/motion permission use.
- Suggested next skills: `implementation-execution` after stack/package choices are made; `feasibility-review` if the first slice expands to acoustic positioning, WASM, or advanced timing guarantees.

## Implementation Strategy

Build the first slice around one validated fixture Composition rather than authoring UI. This keeps the implementation honest: Host, Participant, server, and runtime must all execute the same saved model before editors are built around it.

Because the repo does not yet contain an application scaffold, start by choosing a modest TypeScript web layout that can support shared code. A workable shape is:

- `apps/server`: session API, WebSocket transport, fixture serving, compact event log.
- `apps/participant`: mobile Participant client, audio unlock, capability checks, runtime execution, visualizer, prompt/choice UI.
- `apps/host`: Host setup, lobby, readiness, start/stop, live monitor, logs.
- `packages/composition`: schema, TypeScript types, validator, fixture package helpers.
- `packages/runtime`: deterministic transport mapping, fake-clock timeline, Step Event scheduling, stale-event skipping.
- `packages/shared`: protocol messages, readiness types, state report types, utility contracts.

If the stack decision favors a single app framework, preserve these boundaries as directories or modules even if they compile through one workspace. The important contract is that schema, protocol, and runtime logic are shared and tested outside UI components.

Implementation should be milestone-gated. Do not build Host dashboard polish before a fixture validates and produces a deterministic timeline. Do not build authoring controls before real devices can join, unlock audio, sync, play, show visuals, handle one UI choice, and recover from interruption.

## Task Breakdown

| Task | Owner Type | Files/Areas | Depends On | Acceptance Check |
| --- | --- | --- | --- | --- |
| Choose project stack and workspace layout | Human-led with agent support | Root scaffold, package manager config, app/package boundaries | None | Repo has runnable dev commands, test command, lint/typecheck command, and agreed app/package boundaries. |
| Add shared Composition schema and types | Agent | `packages/composition`, fixtures | Stack layout | Fixture schema supports Programs, Voices, Patterns, Step Events up to 64 steps, Instrument Triggers, Visualizer Triggers, Parameter Locks, UI prompt, assets, and schema version. |
| Add fixture validator and deterministic errors | Agent | `packages/composition` | Schema/types | Valid fixture passes; malformed fixture reports stable, actionable errors. |
| Create rehearsal fixture package | Agent with human review | `fixtures` or `packages/composition/fixtures` | Schema/validator | Fixture includes at least two Programs, one Voice, one Pattern, one audio event, one visual event, one UI choice, and parameter-lock examples. |
| Build deterministic runtime timeline | Agent | `packages/runtime` | Fixture | Fake-clock test produces expected Step Events, Instrument Sounding Events, Visualizer Display Events, prompt timing, and boundary behavior. |
| Define WebSocket/session protocol | Agent with close review | `packages/shared`, `apps/server` | Schema/runtime basics | Protocol covers create session, join, state report, clock sample, fixture load state, prepare start, start confirmed, stop, force holding, choice, heartbeat, and disconnect. |
| Implement session server | Agent | `apps/server` | Protocol | Host can create a session, receive join code/link data, accept/reject joins, distribute fixture metadata, track members, and log key events. |
| Implement clock sync and transport mapping | Agent with close review | `packages/runtime`, `apps/participant`, `apps/server` | Server protocol | Clients report offset, RTT, jitter, confidence, and last sync; transport position maps from server start time to client-local scheduling time. |
| Build Participant join and notice handoff | Agent with human copy review | `apps/participant` | Server join | Participant sees Performance name, one-line phone role, primary begin/audio action, and privacy/device details link. No normal in-app consent checkbox. |
| Implement audio unlock and capability profile | Agent | `apps/participant` | Participant join | Supported phones can unlock Web Audio from the begin action; failures are visible locally and reported to Host. |
| Implement fixture load and Participant states | Agent | `apps/participant`, `packages/runtime` | Fixture/server | Participant reaches loading, holding, live, recovery, and ending states with state reports to server. |
| Implement minimal Web Audio instrument path | Agent with close review | `apps/participant`, `packages/runtime` | Audio unlock/runtime | At least one scheduled Instrument Trigger produces audible output at the expected transport time on supported mobile browsers. |
| Implement minimal visualizer path | Agent | `apps/participant` | Runtime | At least one scheduled Visualizer Trigger changes full-screen output at the expected transport time. |
| Implement UI Device prompt and choice | Agent | `apps/participant`, `apps/server`, `packages/shared` | Runtime/server | Participant can choose between two options; choice is acknowledged immediately and applied at the configured boundary. |
| Implement stale-event skipping and recovery | Agent with close review | `apps/participant`, `packages/runtime` | Participant runtime | Reconnect, resume, or late message handling rejoins current transport without replaying stale Step Events. |
| Build Host setup and lobby | Agent | `apps/host`, `apps/server` | Session server | Host selects fixture, names session, opens lobby, displays QR/link, and sees joined Participants. |
| Build Host readiness classifier | Agent with close review | `apps/host`, `packages/shared` | State reports | Dashboard classifies `ready`, `degraded`, or `blocked` using participant count, assets, clock sync, audio unlock, capabilities/permissions, composition warnings, and fallback policy. |
| Build Host start/stop/force holding flow | Agent with close review | `apps/host`, `apps/server`, `packages/shared` | Readiness/server/runtime | Host can request scheduled start, see pending/confirmed state, stop Performance, and force holding. Actions are logged. |
| Build Host live monitor and logs | Agent | `apps/host`, `apps/server` | Start flow | Host sees elapsed time, connected Participants, Voice population, Program cursor distribution, audio/sync health, choice counts, and compact event log. |
| Add physical notice copy and operator checklist | Human-led with agent draft | `plan`, app details page, README/docs | Participant/Host flow | QR signage copy, app details copy, and rehearsal operator checklist are consistent and reviewed. |
| Real-device rehearsal validation | Human-led with agent support | Manual QA scripts, issue list | End-to-end slice | Two or more phones plus Host complete join, audio unlock, sync, scheduled start, audio/visual event, choice, recovery, stop, and log review. |

## Sequencing

1. **Foundation gate:** Scaffold workspace, add schema/types, validator, fixture, and fake-clock timeline tests. Integration point: fixture validates and emits the expected deterministic runtime timeline.
2. **Protocol/server gate:** Define shared protocol, implement session server, membership, state reports, and event logs. Integration point: simulated Host and Participant clients can create, join, report, and receive lifecycle messages.
3. **Participant runtime gate:** Build join, audio unlock, capability profile, fixture load, clock sync, scheduler, audio, visualizer, UI choice, and recovery. Integration point: Participant can run a local fixture against server transport with fake and real browser clocks.
4. **Host control gate:** Build setup, lobby, readiness, scheduled start, stop, force holding, live monitor, and logs. Integration point: Host can operate a full rehearsal session locally.
5. **Real-device gate:** Test on real iOS Safari and Android Chrome devices on local network. Integration point: failures are documented and either fixed or explicitly moved to follow-up scope before authoring or positioning work begins.

Keep schema/protocol changes serialized until the first end-to-end pass is stable. After that, Participant UI, Host UI, server observability, and docs can proceed in parallel as long as shared message contracts are reviewed.

## Test Plan

- Unit tests: Composition validator; Step Event parsing; 64-step Pattern timeline; Parameter Lock merge behavior; boundary application; stale-event skipping; readiness classifier; clock offset/RTT/jitter calculations; protocol message validation; state reducers.
- Integration tests: Session creation/join; invalid/closed session handling; WebSocket membership; fixture distribution; state report aggregation; prepare-start/start-confirmed flow; stop/force holding; choice submission and boundary application; compact event logging.
- End-to-end tests: Host creates session; Participant joins; Participant unlocks or simulated-unlocks audio; Host sees readiness; Host starts; Participant enters live; audio/visual/UI events are scheduled; Participant chooses; Host sees choice count; Host stops. Use browser automation for simulated clients where possible.
- Manual QA: Run at least one rehearsal with Host plus two or more real phones. Cover iOS Safari, Android Chrome, audio unlock, background/resume, network reconnect, invalid link, degraded clock sync, asset failure, stop, and force holding.
- Regression areas: Mobile audio unlock, scheduled start timing, reconnect recovery, stale events, readiness classification, emergency stop/holding, physical notice/details copy, accessibility of Participant prompts and Host controls.
- Test data: One valid basic fixture, one fixture with Parameter-only Step Events, one fixture with missing asset, one fixture with optional degraded feature, one malformed schema fixture, and one long 64-step Pattern fixture.

## Migration Plan

There is no production data migration in this slice because the repo is planning-only and the first implementation is greenfield.

Still treat schema as versioned from the start:

- Add `schemaVersion: "0.1.0"` to fixture Compositions.
- Keep fixtures small and checked in.
- Add validator errors that include schema version context.
- Avoid storing implementation-specific Web Audio node details in Composition JSON.
- If local persistence is added for development sessions, keep it disposable or provide a dev reset command.

Compatibility target for this slice is same-version fixture execution only. Backward compatibility for authored packages can wait until authoring/export exists.

## Rollout Plan

Roll out as a local rehearsal tool, not a public release.

- Stage 1: Developer-only local run with simulated clients and fake-clock tests.
- Stage 2: Local network run with one Host browser and one phone.
- Stage 3: Local network run with one Host browser and two or more phones.
- Stage 4: Rehearsal run using the physical notice copy and operator checklist.

Use a clear environment label such as `rehearsal` or `local` in the Host UI and logs. Do not claim public deployment readiness until signage/legal review, flashing/motion safety review, and emergency behavior review are complete.

Monitor during rehearsal through Host live state and compact logs:

- joined/disconnected counts
- ready/degraded/blocked counts
- clock sync quality
- audio unlock failures
- asset failures
- choice submissions
- stop/force holding actions
- reconnect and stale-event recovery

## Rollback Plan

For code rollback, revert the rehearsal slice commit or disable the rehearsal runtime route/feature flag if one is introduced. No production data rollback is expected.

For live rehearsal rollback:

- Host stop immediately ends the Performance transport.
- Host force holding returns Participants to a non-progressing state when stop is too disruptive.
- Participants can leave by closing the page.
- If server state becomes inconsistent, close the session and create a fresh session with a new join code.

For schema rollback:

- Keep fixture schema changes behind versioned fixtures.
- Do not migrate existing fixtures in place without keeping the previous fixture available until the new validator passes and the runtime timeline test is updated.

## Documentation And Release Materials

- Developer setup README with install, dev, test, lint/typecheck, and local network testing commands.
- Fixture schema notes covering Programs, Voices, Patterns, Step Events, Instrument Triggers, Visualizer Triggers, Parameter Locks, UI prompt, assets, and schema version.
- Runtime/protocol notes for session lifecycle, state reports, clock sync, scheduled start, stop, force holding, and choice handling.
- Physical notice copy for QR signage, with matching in-app privacy/device details.
- Host rehearsal checklist covering setup, lobby, readiness, degraded override, start, stop, force holding, and log review.
- Manual QA checklist for iOS Safari, Android Chrome, reconnect/resume, audio suspension, invalid links, and degraded states.
- Known limitations document: no authoring UI, no positioning integration, no public deployment safety claim, no account system, no full synth editor.

## Review Gates

| Gate | Trigger | Reviewer | Pass Criteria |
| --- | --- | --- | --- |
| Stack and workspace gate | Before production code scaffold settles | Human technical owner | Framework, package layout, dev commands, test commands, and local network workflow are agreed. |
| Schema/runtime gate | Before server and UI depend heavily on fixture data | Human technical owner or close agent review | Fixture validates; fake-clock timeline is deterministic; Step Event and Parameter Lock semantics match planning docs. |
| Protocol gate | Before multiple clients are built against WebSocket messages | Close technical review | Message types cover lifecycle and recovery; invalid states are handled; protocol names match product language. |
| Participant gate | Before Host polish | Human/product review plus technical review | Join/audio/holding/live/recovery states work; physical notice model is reflected; operational copy is short and clear. |
| Audio/timing gate | Before real rehearsal | Close technical review | Scheduled audio/visual events fire from transport time, not message arrival; stale events are skipped; clock quality is reported. |
| Host readiness gate | Before degraded starts are allowed | Human/product review | Readiness shows status, top blockers, audience-visible impact, and recommended action. |
| Accessibility/safety gate | Before any public audience use | Human-led review | Participant prompts are readable and announceable; status is not color-only; flashing/motion/signage concerns are reviewed. |
| Real-device gate | Before authoring or positioning becomes next scope | Human-led rehearsal | Two or more phones plus Host complete the end-to-end flow with documented failures resolved or explicitly deferred. |

## Agent/Human Ownership

- Agent suitability: Project scaffolding after stack choice, schema/types, validator, fixtures, runtime timeline tests, WebSocket protocol, server session lifecycle, Participant states, Host dashboard mechanics, automated tests, and first-draft docs/checklists.
- Human-led areas: Stack preference if there are strong local opinions, public notice/legal language, first fixture artistic/audio direction, Host viewport support decision, clock threshold acceptance, public safety review, and real-device rehearsal judgment.
- Close-review areas: Web Audio timing, clock sync math, scheduled start semantics, stale-event recovery, emergency stop/holding behavior, readiness classifier, protocol contracts, and permission/privacy copy.
- Parallelization opportunities: After schema/protocol contracts are stable, one agent can work on Participant runtime, one on Host dashboard, one on server/logging, and one on docs/manual QA. Avoid parallel edits to shared schema/protocol files unless one owner coordinates contract changes.
