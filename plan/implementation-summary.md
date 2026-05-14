# Implementation Summary: Foundation Runtime Gate

## Context Capsule

- Request: Use `implementation-execution` at standard depth.
- Current recommendation: Treat this as the first delivery-plan gate: establish the TypeScript workspace, shared Composition contract, validated rehearsal fixture, deterministic runtime timeline helpers, and focused tests.
- Confidence: medium-high for the foundation gate. The full rehearsal product still needs server, Participant, Host, audio, and real-device work.
- Artifact depth: standard.
- Evidence used: `delivery-plan.md`, `scope-decision.md`, `composition-schema.md`, `timing-model.md`, `audio-engine.md`, and `phased-implementation.md`.
- Key assumptions: TypeScript monorepo is acceptable; first implementation should prove schema/runtime behavior before UI; Web Audio scheduling will be added after deterministic runtime events exist.
- Blocking questions: Frontend/server framework choice is still open for the next gate. Clock-sync thresholds, Host viewport, and first audio-engine implementation details are still undecided.
- Decisions already made: Step sequencer supports up to 64 steps; Step Events can include Instrument Triggers, Visualizer Triggers, Parameter Locks, or Parameter Locks only; the first synth model is polyphonic SH-101-style; normal Participant consent/notice is physical signage, not app-based consent.
- Constraints discovered: Repo was planning-only before this work. Existing `.obsidian/workspace.json` changes were unrelated and left untouched.
- Escalations: Real-device timing, Web Audio behavior, Host readiness, physical notice/legal copy, and public safety review remain future gates.
- Suggested next skills: Continue with `implementation-execution` for the server/protocol gate; use `feasibility-review` if acoustic positioning or WASM is pulled into the next implementation slice.

## Changes Made

| Area | Files | Summary |
| --- | --- | --- |
| Workspace scaffold | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `.gitignore`, `pnpm-lock.yaml` | Added a pnpm TypeScript workspace with strict typechecking, Vitest, and root `test`, `typecheck`, and `check` scripts. |
| Composition package | `packages/composition/src/types.ts`, `packages/composition/src/validate.ts`, `packages/composition/src/index.ts`, `packages/composition/package.json` | Added shared Composition types, Step Event types, trigger/lock/device types, schema version constant, and deterministic validator. |
| Rehearsal fixture | `packages/composition/fixtures/rehearsal-basic.json` | Added a minimal fixture with two Programs, a 16-step Pattern, Instrument/Visualizer Triggers, Parameter Locks, a Parameter-only Step Event, polyphonic SH-101-style defaults, and one UI choice prompt. |
| Runtime package | `packages/runtime/src/timeline.ts`, `packages/runtime/src/index.ts`, `packages/runtime/package.json` | Added deterministic timeline generation, default/lock parameter merging, dotted Parameter Lock path handling, UI prompt event emission, and stale-event skipping. |
| Tests | `packages/composition/src/validate.test.ts`, `packages/runtime/src/timeline.test.ts` | Added focused tests for fixture validation, 64-step limit, Parameter-only Step Events, deterministic event timing, Parameter Lock merging, UI prompts, and stale-event skipping. |

## Acceptance Criteria Status

| Criterion | Status | Evidence |
| --- | --- | --- |
| Workspace has runnable dev/test commands | Done | `pnpm check` runs typecheck and tests successfully. |
| Fixture Composition validates deterministically | Done | `validateComposition` returns stable path/code/message issues; fixture test passes. |
| Step sequencer supports configurable steps up to 64 | Done | Type includes `stepCount`; validator rejects values outside `1..64`; test covers rejection above 64. |
| Step Events support Instrument Trigger, Visualizer Trigger, and Parameter Locks | Done | Fixture includes all three; runtime emits instrument, visualizer, and parameter-lock events. |
| Parameter-only Step Events are valid | Done | Fixture step 12 contains only Parameter Locks; validator and runtime tests cover it. |
| Runtime produces deterministic expected event timeline | Done | Runtime test asserts exact ordered event sequence and times for the initial Program. |
| Runtime skips stale events on recovery | Done | `skipStaleEvents` test verifies past transport events are filtered while upcoming events remain. |
| Engine-specific details do not leak into Composition schema | Partially done | Composition stores typed device defaults and triggers, not Web Audio node graphs. Full audio engine boundary remains future work. |

## Tests And Verification

| Check | Result | Notes |
| --- | --- | --- |
| `pnpm typecheck` | Passed | Strict TypeScript compile with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. |
| `pnpm test` | Passed | 2 test files, 9 tests passed. |
| `pnpm check` | Passed | Runs typecheck then tests. |

## Migration/Rollout Notes

No production migration or rollout is involved. This is a greenfield foundation scaffold.

The fixture schema starts at `schemaVersion: "0.1.0"`. Future schema changes should either update fixtures and runtime tests together or introduce explicit version handling.

## Documentation Updates

This implementation summary is the documentation update for this gate. The existing delivery plan remains accurate: next work should proceed through protocol/server, Participant runtime, and Host control gates.

Still needed:

- Developer README once the server/app scaffold exists.
- Fixture schema reference once the schema settles past the first implementation pass.
- Runtime/protocol notes when WebSocket message contracts are added.

## Risks And Follow-Ups

- The validator is a hand-written first pass, not a generated JSON Schema or Ajv/TypeBox schema. Revisit if external schema artifacts become important for tooling or package validation.
- Runtime timeline generation is deterministic but not yet connected to Web Audio's `AudioContext.currentTime`.
- No server, WebSocket protocol, Participant UI, Host UI, QR flow, readiness classifier, or real-device audio test exists yet.
- The rehearsal fixture references a sample path placeholder; actual asset loading and hashing are future work.
- The UI prompt event currently appears at Program start. Richer UI timing rules can be added when Participant runtime work begins.

## Review Notes

Close review should focus on:

- `packages/composition/src/types.ts`: whether the initial Composition/Step Event shape matches the intended authoring/runtime contract.
- `packages/composition/src/validate.ts`: validation strictness, especially whether every Program Voice should require Pattern, Instrument, and Visualizer in v1.
- `packages/runtime/src/timeline.ts`: event ordering, repetition semantics, Parameter Lock merge behavior, and stale-event skip semantics.
- `packages/composition/fixtures/rehearsal-basic.json`: whether the fixture is representative enough for the first server/Participant/Host implementation gate.
