# Herd

Herd is a web-based rehearsal prototype for synchronized phone-as-sound-and-light performances.

This repo currently implements the rehearsal vertical slice plus browser-based Composition authoring:

- Host dashboard for creating a session, showing a QR/link, monitoring readiness, starting, stopping, forcing holding, and reviewing logs.
- Participant mobile client for joining, unlocking audio, syncing clock, running the fixture, showing visuals, submitting a choice, recovering, and ending.
- Authoring app for creating/editing Compositions, Programs, Voices, Step Events, Parameter Locks, modulation routes, device defaults, UI prompts, asset references, sampler zones, JSON files, and `.herd.zip` packages with media assets.
- Sonic Positioning Lab prototype for role assignment, chirp profile selection, simulated scan evidence, relative layout preview, and evidence export.
- In-memory Node/WebSocket server for session coordination.
- Shared Composition, runtime, and protocol packages.

## Commands

```sh
pnpm install
pnpm check
pnpm build
pnpm dev
```

## Local URLs

When `pnpm dev` is running:

- Host: http://localhost:5173
- Participant: http://localhost:5174
- Authoring: http://localhost:5175
- Positioning Lab: http://localhost:5176
- Server health: http://localhost:8787/healthz
- Server readiness: http://localhost:8787/readyz
- Server version: http://localhost:8787/version

The Positioning Lab dev server binds to `0.0.0.0` and uses the machine's LAN IPv4 address for its device join QR/link. Override the advertised device URL with `POSITIONING_LAB_PUBLIC_ORIGIN=http://<host>:5176 pnpm dev:positioning` when needed.

## Authoring Packages

Use Export Package to download a `.herd.zip` archive containing:

- `composition.json`
- media files referenced by the Composition assets

Use Import Package to restore the archive into local authoring state. Imported package media is rehydrated for rehearsal launch and Participant sampler playback.

## Creator Persistence Prototype

The Authoring app includes a creator persistence panel for saving authored Compositions and creating package records through the local server API.

The server currently includes:

- creator Composition/package API endpoints
- an in-memory creator store for local development and a Postgres-backed store when `DATABASE_URL` is configured
- an initial Postgres migration for users, Compositions, and Packages
- a migration runner: `pnpm --filter @herd/server db:migrate`
- Tigris-compatible signed upload URL generation when `TIGRIS_ENDPOINT`, `TIGRIS_BUCKET`, `TIGRIS_ACCESS_KEY_ID`, and `TIGRIS_SECRET_ACCESS_KEY` are configured

## Positioning Lab

The Positioning Lab is a standalone controller prototype for acoustic positioning tests. It supports device labels and roles, chirp profiles, simulated scans, approximate relative layout preview, and JSON evidence export.

## Rehearsal Flow

1. Open the Authoring URL and edit or create a Composition.
2. Use Open rehearsal to create a session from the active Composition.
3. Open the Participant URL from the Host QR code or join link.
4. Tap Begin on the Participant client to unlock audio.
5. Wait for Host readiness to become ready or degraded.
6. Start from the Host dashboard.
7. The Participant runs the authored Composition, plays scheduled synth events, displays visuals, and shows choice prompts.
8. Submit a Participant choice and confirm Host choice counts/logs update.
9. Stop from the Host dashboard.

## Current Limits

- Sessions are in memory only.
- Authoring saves to browser local storage, local `.herd.zip` archives, and local server creator endpoints. The local runtime uses memory by default and switches to Postgres when `DATABASE_URL` is configured.
- Server-side package records and Tigris signed upload URL generation exist; actual durable package upload requires Tigris environment variables and deployed object storage credentials.
- Email magic-link auth, account sessions, and account asset libraries are not implemented yet.
- Participant runtime plays the minimal polyphonic SH-101-style synth path and embedded sampler audio zones; the full instrument engine is not implemented.
- The Host and Participant apps are rehearsal-only and not public deployment-ready.
- The Positioning Lab uses simulated scan evidence only; real acoustic chirp emission, microphone capture, correlation, and physical accuracy validation still require real devices.
- Account management and public safety review are still out of scope.
