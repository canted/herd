# Agentic Workflow State

## Current Goal

Build out Herd from the durable specs into a fuller app, continuing beyond the rehearsal runtime slice.

## Current Recommendation

Continue from the authoring/composition, sampler rehearsal, local package, positioning-lab, creator-persistence, auth/session, and deployment scaffold milestone into live credential verification and real-device validation. The app can now create authored Compositions, package local media in `.herd.zip` archives, import those packages, launch them into rehearsal sessions, play authored sampler zones in the Participant runtime, edit modulation routes in the authoring UI, authenticate Authors/Hosts with magic links, create creator Composition/package records through memory or Postgres-backed server storage, confirm signed package uploads, expose signed downloads, serve built apps from the Node server, and run a standalone simulated Sonic Positioning Lab workflow.

## Completed Phases

- Planning artifacts: interaction design, usability review, scope decision, delivery plan.
- Foundation runtime: TypeScript workspace, Composition schema/types, validator, fixture, deterministic timeline tests.
- Rehearsal vertical slice: Host dashboard, Participant client, in-memory session server, protocol/readiness package, minimal Web Audio/visual runtime.
- Authoring/composition tools MVP: Composition browser, Program Sequencer, vertical Voice stack, Step Sequencer up to 64 steps, trigger layers, Step Event editor, Lock Capture, Instrument/Visualizer/UI Device editors, modulation target capture, validation, local persistence, import/export, and preview.
- Authored Composition rehearsal integration: Authoring can create a Host rehearsal session with the active Composition; server validates/stores that Composition per session; Host and Participant receive the authored session package.
- Asset and sampler authoring metadata: asset import creates Composition asset references with decoded audio duration when available; sampler Instruments can define zones with asset, pitch, velocity, root key, gain, trim, and loop settings.
- Runtime sampler playback: Authoring embeds imported media as prototype data URL payloads in Composition metadata; Participant decodes embedded audio assets, reports asset readiness, and routes sampler Instrument events through AudioBuffer playback.
- Durable local package workflow: Authoring exports `.herd.zip` archives containing `composition.json` plus media files, imports the same archive format, rehydrates local media for rehearsal, and round-trips packages into Host/Participant sessions.
- Richer modulation route editing: Authoring exposes captured modulation routes with source selection, enable/disable, amount, range min/max, invalid-target flags, and route deletion for Instrument and Visualizer controls.
- Creator persistence/package scaffold: Server exposes creator Composition/package endpoints backed by a local in-memory store or Postgres when `DATABASE_URL` is configured, includes an initial migration runner and Postgres migration for users/Compositions/Packages, exposes deployment health/readiness/version endpoints, and can generate Tigris-compatible signed package upload URLs when object-storage secrets are configured.
- Production foundation: Server exposes Resend/dev magic-link auth, signed HttpOnly sessions, authenticated creator ownership, package upload confirmation/download URLs, expanded Postgres migration tables, richer health/readiness/version checks, same-origin static app serving, Docker/Fly scaffolding, CI/deploy workflow, and smoke-test script.
- Sonic Positioning Lab prototype: standalone controller app with session QR, device labels/roles, chirp profiles, simulated scan measurements, approximate relative layout preview, operator notes, and JSON evidence export.

## Active Phase

- Durable backend integration and real-device validation:
  - Configure production secrets and verify Resend magic-link delivery in staging.
  - Configure and verify Tigris package upload/download in a deployed environment.
  - Replace simulated lab measurements with real chirp emission, microphone capture, cross-correlation, and upload flow.
  - Validate mobile timing, sample-rate behavior, mic permission UX, and acoustic robustness on physical iOS/Android devices.

## Recently Completed Phase

- Authoring/composition tools MVP.
- Authored Composition rehearsal integration.
- Asset manager and sampler zone authoring.
- Runtime sampler playback for embedded authoring assets.
- Durable local `.herd.zip` package export/import.
- Richer authoring modulation route UI.
- Creator Composition/package API scaffold with memory/Postgres store selection, migration runner, Postgres migration, deployment health endpoints, and Tigris signed upload URL utility.
- Magic-link auth/account sessions, authenticated creator APIs, package upload confirmation/download URLs, deployment scaffolding, and production static app serving.
- Simulated Sonic Positioning Lab prototype.

## Next Phase

- Staging credential verification for Resend/Tigris/Fly, then real-device Sonic Positioning Lab client/protocol work gated by physical-device testing.

## Blocked Items

- Public deployment readiness and legal/signage review remain outside the current implementation phase.
- Actual Tigris upload/download verification requires real Tigris credentials and environment configuration.
- Production magic-link delivery requires Resend provider secrets and staging verification.
- Acoustic positioning accuracy, microphone capture behavior, and real-device mobile timing require physical iOS/Android devices in a real room before they can be called complete.

## Deferred Items

- Runtime modulation routing depth beyond captured target amount/range editing.
- Account asset libraries beyond authenticated Composition/package records. Storage provider decision: use Tigris for backend object/package storage.
- Public package storage and account-scoped asset libraries. Storage provider decision: use Tigris for package/media assets.
- Production acoustic-positioning solver and robust real measurement pipeline.

## Decisions Made

- Backend object/package storage will use Tigris.
- Auth will use email magic links.
- Accounts are for Authors and Hosts only; Participants remain anonymous per session.
- Users own Compositions and Packages.
- Metadata persists in Postgres.
- Tigris uses one private bucket with scoped object keys.
- Package access is private signed URLs/server-mediated reads; Participants are authorized automatically through a valid session/package join path.
- Initial deployment target remains Fly.io/Render-style app hosting, with Fly.io as the current concrete deployment plan.
- One project owner owns infrastructure and secrets initially.
- First persistence target is authored Compositions and Packages.

## Next Intended Action

Provision staging secrets, run migrations and smoke tests on Fly, verify real Resend/Tigris upload/download, then implement and validate real-device positioning and mobile timing.
