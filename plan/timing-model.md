# Timing Model

This document defines how Herd keeps many browser clients musically aligned.

## Principle

The server provides a shared time reference. Clients schedule audio, visual, and UI events locally against that reference.

Network messages should announce future events early enough for clients to schedule them. Messages should not be treated as the real-time trigger for musical events unless the event is explicitly non-musical or best-effort.

## Transport

Each Performance has a transport:

- `serverTime`: shared clock basis
- `transportStartTime`: server time when playback begins
- `tempo`: beats per minute
- `meter`: optional musical meter
- `programId`: current local or forced Program
- `position`: derived bars, beats, steps, and loop count

Clients calculate transport position from `serverTime - transportStartTime`.

## Clock Sync

Before a Performance starts, every client must complete clock synchronization.

The clock sync process should estimate:

- offset from server time
- round-trip latency
- jitter
- confidence
- last successful sync time

Clients with poor sync quality can remain in lobby, play reduced behavior, or be marked unhealthy on the Host dashboard.

## Scheduling Window

Clients should schedule local audio and visual events ahead of time.

Recommended defaults:

- audio lookahead: 100-250 ms
- visual lookahead: 50-150 ms
- UI lookahead: one step, beat, or loop depending on event type
- server command lead time: 1-3 seconds for major transitions

The exact values should be tested on mobile browsers.

## Musical Boundaries

State changes can apply at defined boundaries:

- `immediate`
- `nextStep`
- `nextBeat`
- `nextBar`
- `patternLoopEnd`
- `patternRunEnd`
- `programEnd`

The default for UI-driven choices and Program jumps should be `patternLoopEnd`.

## Pattern Time

A Pattern defines:

- step count
- step duration or tempo relationship
- loop duration
- repetition count
- whether it can run forever
- quantization for generated events

A Pattern can report completion after a fixed number of repetitions. A forever Pattern never completes unless a UI choice, Host action, or external rule queues a transition.

## Late Join

A late-joining client receives:

- full Composition package
- current Performance state
- current server clock sync
- current Program histogram
- current global flags
- current positioning state if available

The Composition defines how the client enters:

- join current Program mid-cycle
- wait for next Pattern loop
- wait for next Program
- remain in holding behavior until assigned

## Drift And Recovery

Clients should continuously refine clock offset while avoiding audible jumps.

If drift is small, clients should correct gradually. If drift is large, clients should resync at a safe musical boundary or enter recovery mode.

If a client misses a scheduled event, it should skip stale events and preserve the timing of upcoming events.

