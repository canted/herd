# Authority Model

This document defines which parts of a Performance are controlled by the server, the Host, and each client.

## Principle

Clients should execute the Composition locally. The server should synchronize clocks, distribute state, collect health reports, and coordinate shared decisions.

The server should not schedule every Step Event. Herd depends on many devices producing tightly timed local audio and visuals, so clients need enough Composition data and clock information to keep playing even when the network is temporarily poor.

## Server Authority

The server owns Performance-level truth:

- Performance ID and join code
- selected Composition package
- lobby membership
- Participant IDs
- Host identity
- server clock reference
- start time
- global transport state
- current shared flags
- Program cursor distribution
- calibration and positioning state
- beacon assignment
- emergency fallback mode

The server broadcasts state updates, but clients should be able to continue local playback during short network gaps.

## Client Authority

Each client owns its local execution:

- audio rendering
- visual rendering
- Pattern playback
- Instrument state
- Visualizer state
- UI display
- local modulation evaluation
- local Voice assignment once rules are known
- missed-event recovery

The client receives the full Composition package before the Performance starts. Once the Host starts the Performance, the client schedules its own events against the synchronized server clock.

## Host Authority

The Host owns session-level controls:

- select Composition
- open or close lobby
- start calibration
- start Performance
- stop Performance
- force fallback mode
- manually queue or force a Program for all or selected Participants
- restart a failed phase
- remove or ignore malfunctioning devices

The Host should not need to micromanage normal Program progression.

## Start Protocol

Recommended start flow:

1. Host requests start.
2. Server chooses a start time in the near future.
3. Server broadcasts `prepareStart` with the server start time and Composition revision.
4. Clients confirm receipt and readiness.
5. Server decides whether quorum is sufficient.
6. Server broadcasts `startConfirmed`.
7. Clients begin local playback at the scheduled time.

If a client receives the start message late, it should join according to the Composition's late-start policy:

- start immediately at the correct transport position
- wait for the next Pattern loop boundary
- wait for the next Program boundary
- remain in holding state until reassigned

## Event Timing

Musical, visual, and UI events should be scheduled locally from the Composition and synchronized transport clock.

If a client misses an event, it should not try to replay stale events in a way that breaks timing. It should skip or approximate the missed event and make sure the next scheduled event is on time. 

## UI Choices

Most UI choices should apply at a quantized boundary:

- next step
- next beat
- next Pattern loop
- end of Pattern run
- next Program

The default should be `patternLoopEnd`, because that preserves musical coherence while still feeling responsive.

UI choices may produce:

- Parameter changes
- Participant Voice assignment
- queued Program IDs
- temporary Pattern repetition changes
- Composition flags
- server-visible votes or counts

## Program Progression

Program progression is primarily Composition logic evaluated by clients. By default, each Participant may progress independently through Programs while staying aligned to the shared clock.

The server can coordinate shared state by broadcasting aggregate facts, but it should not assume that Program divergence is a problem. Lockstep progression and bounded catch-up are opt-in Composition policies.

Example of a possible bounded-catch-up rule:

- the Composition sets `programSyncPolicy` to `boundedCatchUp`
- clients report their local Program cursors
- server broadcasts a Program cursor distribution
- clients use the distribution in progression rules
- if 75 percent of clients have passed a Program, lagging clients may be forced forward according to the Composition's catch-up rule

The server may set global flags that affect progression, but the normal progression rules should remain visible in the Composition.

## State Reports

Clients should periodically report:

- local Program cursor
- current Pattern loop
- Voice assignment
- transport offset estimate
- audio state
- visibility state
- battery state if available
- network quality
- permission state
- positioning state

Reports are for monitoring, catch-up logic, and recovery. They are not a requirement for every local event.

## Missed Or Conflicting State

When server state and local state conflict, the client should prefer:

1. emergency stop or fallback from server
2. forced Program from Host
3. server-confirmed global flags
4. local Composition logic
5. local best effort

This keeps live control possible without making every ordinary event server-dependent.
