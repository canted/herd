# Implementation Summary: Rehearsal App Vertical Slice

## Context Capsule

- Request: Build the rest of the app after the foundation runtime gate.
- Current recommendation: Treat "rest" as the scoped rehearsal vertical slice, not full authoring, acoustic positioning, account management, or public deployment. The slice now has a working local Host app, Participant app, session server, shared protocol, runtime sequencing, and tests.
- Confidence: medium. The local vertical slice works in browser automation, but real-device iOS Safari/Android Chrome rehearsal remains the next gate.
- Artifact depth: standard.
- Evidence used: `delivery-plan.md`, `scope-decision.md`, `phased-implementation.md`, `composition-schema.md`, `timing-model.md`, `audio-engine.md`, `host-dashboard.md`, and the committed foundation packages.
- Key assumptions: React/Vite is acceptable for Host and Participant apps. The first server can be in-memory. Physical signage remains the normal notice model. Web Audio V1 is the first playback path. Acoustic positioning and authoring are deferred.
- Blocking questions: Real-device clock/audio thresholds, minimum supported Host viewport, public signage/legal copy, and final deployment model remain unresolved.
- Decisions already made: Step Events can include Instrument Triggers, Visualizer Triggers, and Parameter Locks; parameter-only Step Events are valid; Step Events do not have Modulation Mode; the initial synth is a bounded polyphonic SH-101-style path.
- Constraints discovered: Workspace packages had to be linked with `pnpm install` after app creation. The Browser plugin was not available as a callable tool, so browser verification used Playwright Core with the local Google Chrome executable.
- Escalations: Real-device timing, audio unlock behavior, mobile background/resume, physical notice/legal review, flashing/motion safety, and public deployment readiness.
- Suggested next skills: `review-and-learn` after a real-device rehearsal; `feasibility-review` before pulling acoustic positioning or WASM into implementation.

## Changes Made

| Area | Files | Summary |
| --- | --- | --- |
| Shared protocol | `packages/protocol/src/*` | Added session, participant report, readiness, WebSocket message, log, choice, and public session types plus readiness classification. |
| Runtime sequencing | `packages/runtime/src/timeline.ts` | Added Composition-level timeline generation across Program Sequencer steps so the fixture reaches the UI choice Program. |
| Server | `apps/server/src/server.ts`, `apps/server/src/sessionStore.ts` | Added HTTP APIs, WebSocket connection handling, fixture validation/distribution, in-memory sessions, participant membership, state reports, clock pong, Host start/stop/holding commands, choices, logs, and snapshots. |
| Host app | `apps/host/src/*` | Added React/Vite Host dashboard with setup, QR lobby, readiness summary, transport controls, blockers/impact, Participant table, choice counts, and logs. |
| Participant app | `apps/participant/src/*` | Added React/Vite mobile client with join flow, audio unlock, clock sync, fixture scheduling, minimal SH-101-style Web Audio synth, visualizer, prompt choice, holding/live/recovery/ending states. |
| Workspace | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig*.json`, `vitest.config.ts` | Added dev/build scripts, app/package inclusion, workspace aliases for tests, and frontend/server dependencies. |
| Docs | `README.md`, `plan/implementation-summary.md` | Added local run instructions and updated implementation summary. |

## Acceptance Criteria Status

| Criterion | Status | Evidence |
| --- | --- | --- |
| Host can create a session, open lobby, show QR/link, and see joined Participants | Done | Browser flow created a Host session and Participant joined via generated link. |
| Participant can join, unlock audio, load fixture, sync clock, and reach holding | Done locally | Participant browser flow clicked Begin, loaded fixture, reported audio/assets/clock, and appeared ready in Host. |
| Host readiness shows ready/degraded/blocked with blockers and action | Done | `summarizeReadiness` is shared and tested; Host renders readiness band, blockers, impact, and recommended action. |
| Host can start scheduled playback and stop | Done | Browser flow clicked Start and Stop; Participant reached live prompt and then ended state. |
| Participants locally schedule fixture Step Events from shared transport | Done locally | Participant schedules Composition timeline from `startConfirmed` and shared clock offset; Web Audio synth events schedule against `AudioContext.currentTime`. |
| Fixture produces one audio event, one visual event, and one UI choice | Done locally | Runtime tests cover events; browser flow reached "Choose a path" and submitted `choice-left`. |
| Participant recovery skips stale events and rejoins current transport position | Partially done | Runtime stale-event helper exists and Participant schedules only upcoming events. Full reconnect/resume QA on real phones remains. |
| Compact event log records key actions | Done | Server logs lobby opened, join, start, choice, stop; Host renders event log. |

## Tests And Verification

| Check | Result | Notes |
| --- | --- | --- |
| `pnpm check` | Passed | Typecheck plus 4 Vitest files, 16 tests. |
| `pnpm build` | Passed | Host and Participant Vite production builds succeeded. |
| Headless Chrome rehearsal flow | Passed | Created Host session, joined Participant, clicked Begin, Start, reached prompt, submitted choice, saw Host choice count, clicked Stop, saw Participant ended state. |
| Visual screenshot sanity check | Passed for first slice | Host dashboard and Participant end state screenshots were inspected from `/tmp/herd-host-qa.png` and `/tmp/herd-participant-qa.png`. |

## Migration/Rollout Notes

No production migration. The server is in-memory and local-only.

Run locally with `pnpm dev`. Host uses `http://localhost:5173`, Participant uses `http://localhost:5174`, and the server uses `http://localhost:8787`.

Do not use this for public audience deployment yet. Public use still needs physical notice/legal copy, flashing/motion safety review, deployment hardening, HTTPS/mobile-network validation, and real-device rehearsal evidence.

## Documentation Updates

- Added root `README.md` with setup, local URLs, rehearsal flow, and current limits.
- Updated this implementation summary.

Still needed:

- Protocol reference once message contracts settle.
- Manual real-device QA checklist after first iOS/Android rehearsal.
- Physical QR signage copy and privacy/device details copy review.

## Risks And Follow-Ups

- Web Audio behavior has only been verified in headless desktop Chrome, not real iOS Safari or Android Chrome.
- Audio output is a minimal synth path; sampler assets and full SH-101-style controls are not implemented.
- Clock sync uses simple ping/pong estimates; thresholds are provisional.
- Sessions are volatile and single-process.
- Participant reconnect/resume exists as a UI state but needs real-device interruption testing.
- The current Host and Participant UI is functional first; it has not gone through image-concept design signoff.

## Review Notes

Close review should focus on:

- `packages/protocol/src/readiness.ts`: readiness thresholds and whether all-degraded/no-blocker states should remain startable.
- `apps/server/src/server.ts`: WebSocket lifecycle, Host command authority, and in-memory session semantics.
- `apps/participant/src/App.tsx`: clock offset use, scheduling semantics, stale-event filtering, and recovery behavior.
- `apps/participant/src/audio.ts`: minimal synth defaults and safe gain/envelope behavior.
- `apps/host/src/App.tsx`: operational hierarchy for readiness, blockers, transport, and logs.
