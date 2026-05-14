# Herd

Herd is a web-based rehearsal prototype for synchronized phone-as-sound-and-light performances.

This repo currently implements the fixture-driven rehearsal vertical slice:

- Host dashboard for creating a session, showing a QR/link, monitoring readiness, starting, stopping, forcing holding, and reviewing logs.
- Participant mobile client for joining, unlocking audio, syncing clock, running the fixture, showing visuals, submitting a choice, recovering, and ending.
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
- Server health: http://localhost:8787/health

## Rehearsal Flow

1. Open the Host URL.
2. Create a session.
3. Open the Participant URL from the QR code or join link.
4. Tap Begin on the Participant client to unlock audio.
5. Wait for Host readiness to become ready or degraded.
6. Start from the Host dashboard.
7. The Participant runs the fixture, plays scheduled synth events, displays visuals, and shows one choice prompt.
8. Submit a Participant choice and confirm Host choice counts/logs update.
9. Stop from the Host dashboard.

## Current Limits

- Sessions are in memory only.
- The fixture references placeholder asset metadata; actual asset download/decode is still future work.
- Audio is Web Audio V1 with a minimal SH-101-style synth path, not the full instrument engine.
- The Host and Participant apps are rehearsal-only and not public deployment-ready.
- Authoring, acoustic positioning, account management, and public safety review are still out of scope.
