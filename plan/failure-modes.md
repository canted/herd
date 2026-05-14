# Failure Modes

This document defines expected behavior when phones, permissions, network, audio, or server state fail.

## Principle

Failures should degrade the experience without breaking the Performance for everyone else.

Whenever possible, a client should continue on time with reduced features. Stale events should be skipped. Future timing should be preserved.

## No Microphone Permission

Impact:

- no acoustic positioning
- cannot act as Beacon
- may miss any mic-driven interaction

Behavior:

- Participant can remain in the Performance
- positioning state becomes `unlocated`
- position-dependent effects use fallback behavior
- Host dashboard shows microphone unavailable

## No Motion Permission

Impact:

- shaker Pattern cannot produce motion Trigs
- motion-based modulation is unavailable

Behavior:

- client uses Composition-defined fallback
- if no fallback exists, the Participant may have no active behavior for that section
- Host dashboard shows motion unavailable
- authoring validation should warn when shaker sections have no fallback

## Phone Locks Or App Backgrounds

Impact:

- audio may stop
- timers may pause
- WebSocket may disconnect
- visual output is unavailable

Behavior:

- app should request wake lock where supported
- app should warn Participants before start to keep the page open
- on resume, client resyncs clock and rejoins at the current transport position
- stale events are skipped
- Host dashboard shows visibility/background status where available

## Suspended Audio

Impact:

- client cannot produce sound until audio context resumes

Behavior:

- app should unlock audio during setup through a required tap
- client should detect suspended audio context where possible
- Participant sees a prompt to tap to resume audio
- Host dashboard shows audio not running
- visual behavior can continue if available

## Bad Network

Impact:

- missed server updates
- delayed state reports
- disconnects

Behavior:

- client keeps local playback running from last known Composition and clock
- client attempts reconnect
- server sends current Performance state after reconnect
- client resumes at current transport position
- if setup network quality is too poor, the client should not be counted as ready

## Server Restart

Impact:

- clients lose coordination channel
- Host dashboard disconnects
- new Participants cannot join

Target behavior:

- clients continue local playback temporarily
- server restores Performance state from durable or replicated state if available
- clients reconnect and report local Program cursor, Voice, and transport estimate
- server rebuilds Program cursor distributions and health state

For early prototypes, server restart may end the Performance. The production goal should be recovery.

## Muted Device Audio

Impact:

- local audio may be silent even though the app is playing

Behavior:

- detect output failure if the platform exposes useful signals
- otherwise provide setup instructions and test tone
- Host dashboard shows whether audio was unlocked, not whether hardware volume is audible

## Too Many Participants

Impact:

- network load increases
- server distributions and broadcasts grow
- room audio may become too dense
- Voice balance may be distorted

Behavior:

- Composition or Performance setup should define expected and maximum Participant counts
- server should warn when expected count is exceeded
- Host can close lobby
- late join can be disabled
- extra Participants may enter observer, visual-only, or fallback Voice behavior if defined

## Late Join

Impact:

- Participant missed setup, calibration, or earlier UI choices

Behavior:

- server syncs clock
- server sends full Composition and current state
- client enters according to Composition late-join policy
- missing position is allowed
- missing choices use defaults or current aggregate state

## Unexpected Program Divergence

Impact:

- only relevant when a Composition opts into lockstep or bounded-catch-up progression
- a client may lag behind an expected Program boundary

Behavior:

- client reports local Program cursor
- server includes client in Program cursor distribution
- Composition catch-up rules decide whether to force forward if such rules are enabled
- client transitions at next safe boundary

For independent-cursor Compositions, Participants being in different Programs is expected behavior rather than a failure.

## Capability Mismatch

Impact:

- some devices cannot support some features

Examples:

- no Web Audio support
- no AudioWorklet support
- no WASM support for an optional engine kernel
- no SharedArrayBuffer or cross-origin isolation when a feature requires shared memory
- no motion permission
- no wake lock
- unsupported browser

Behavior:

- detect during setup
- classify as ready, degraded, or blocked
- expose in Host dashboard
- use Composition-defined fallback where possible
