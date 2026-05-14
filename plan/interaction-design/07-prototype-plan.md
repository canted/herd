# Interaction Prototype Plan

## Purpose

Sequence the smallest prototypes that will answer the important interaction questions before full implementation. These prototypes should clarify behavior, state, and recovery rather than polished styling.

## Prototype 1: Participant Join And Live Choice

### Scope

- QR/link landing.
- Physical venue notice handoff and lightweight join screen.
- Audio unlock.
- Capability check.
- Holding pattern.
- Prepare start.
- Live visual screen.
- UI prompt with two choices.
- Choice acknowledgment with `patternLoopEnd` feedback.
- Audio resume recovery prompt.

### Questions Answered

- Does the Participant understand what the phone will do?
- Is audio unlock clear enough?
- Does delayed choice feedback feel responsive?
- Can recovery copy be short and effective?

### Acceptance Checks

- A first-time Participant can reach holding state without explanation from the Host.
- A denied optional permission results in a degraded state, not a dead end.
- A choice visibly registers before it applies musically.
- Audio recovery returns the Participant to live state without replaying stale events.

## Prototype 2: Host Lobby, Readiness, And Start

### Scope

- Setup with Composition warnings.
- Lobby QR and join URL.
- Participant counts.
- Ready/degraded/blocked summary.
- Clock/assets/audio/permission checks.
- Start flow with quorum confirmation.
- Degraded override and blocked warning.

### Questions Answered

- Can the Host decide whether to start within seconds?
- Are degraded and blocked states distinct enough?
- Does the start protocol expose the right amount of confirmation?
- Does the Host know what to fix when readiness is poor?

### Acceptance Checks

- Host can explain why the session is ready, degraded, or blocked.
- Host can start a degraded session only after seeing the tradeoff.
- Blocked state is not visually similar to degraded state.
- Event log records start request and confirmation.

## Prototype 3: Host Live Monitor And Emergency Controls

### Scope

- Elapsed Performance time.
- Voice population.
- Program cursor distribution.
- UI choice counts.
- Positioning/fallback status.
- Participant detail drawer.
- Health summary.
- Emergency panel with stop, force holding, disable positioning, disable shaker, force Program.

### Questions Answered

- Can the Host distinguish expected Program divergence from failure?
- Are emergency controls fast but protected?
- Does the dashboard show recommended actions rather than only metrics?

### Acceptance Checks

- Host can find a degraded Participant and identify the cause.
- Host can force holding pattern quickly.
- Stop Performance requires clear confirmation.
- Forced actions are logged with timestamp and Host identity.

## Prototype 4: Authoring Vertical Slice

### Scope

- Composition Browser.
- Program Sequencer.
- Program editor.
- One Voice with Pattern, Instrument, Visualizer, and UI Device lanes.
- Step sequencer with Instrument Trigger, Visualizer Trigger, and Parameter Lock layer toggles.
- Polyphonic SH-101-style synth or sampler stub.
- UI Device choice that queues a Program.
- Modulation mode for one source and two targets.
- Validation panel.
- Multi-Participant preview.

### Questions Answered

- Can an artist understand where they are in the piece?
- Does the Voice lane model make the Composition structure clear?
- Does modulation mode make hidden influence visible?
- Does preview reveal behavior that one-device editing cannot?

### Acceptance Checks

- Author can create a small Composition without touching JSON.
- Author can see what Program comes next.
- Author can route a UI choice to a parameter or Program queue.
- Invalid routes and missing fallbacks are visible before export.

## Prototype 5: Sonic Positioning Lab

### Scope

- Test session controller.
- QR join.
- Device list and labels.
- Role assignment.
- Chirp profile controls.
- Run one scan.
- Detection results table.
- Stop all audio.
- Structured export.
- Test device client with consent, audio unlock, mic state, role, scan status, local stop.

### Questions Answered

- Can an operator run scans without needing the full Performance system?
- Are bad measurements visible enough to avoid false confidence?
- Can device labels and role assignment support real-room testing?
- Is the privacy model clear for microphone use?

### Acceptance Checks

- Six real phones can join a session.
- Operator can assign at least three beacons and three listeners.
- One scheduled scan produces detections/misses with confidence and SNR.
- Results export includes enough metadata for later analysis.
- Stop all audio works from controller and local device.

## Prototype 6: Multi-Surface Rehearsal Simulation

### Scope

- Host dashboard.
- Simulated Participant clients.
- Authoring preview state feeding Host-like readiness.
- Fault injection: no mic, no motion, suspended audio, late join, poor clock sync, unlocated position.

### Questions Answered

- Do the surfaces use the same state language?
- Does authoring validation predict Host readiness problems?
- Are fallbacks observable before a live room test?

### Acceptance Checks

- Same Composition issue appears consistently in authoring validation, preview, and Host readiness.
- Simulated late join follows Composition policy.
- Simulated failures produce expected degraded/blocked classifications.

## Usability Review Focus

The next review should focus on these risks:

- Physical notice and in-app device details may not be clear enough as a pair.
- Host readiness is too dense or too vague.
- Emergency controls are either too easy to trigger or too hard to reach.
- Authors cannot understand independent Program cursors.
- Modulation mode hides too much state or overwhelms the workspace.
- Positioning UI implies more precision than the system can provide.
- Recovery states interrupt the Performance more than necessary.

## Scope Decision Inputs

Recommended build order for the first implementation slice:

1. Participant join, audio unlock, holding, and live prompt.
2. Host setup, lobby, readiness, start, stop, and compact logs.
3. Minimal runtime fixture support for timed audio/visual/choice behavior.
4. Authoring vertical slice only after fixture runtime proves the model.
5. Sonic Positioning Lab scaffold in parallel with or shortly after Host readiness work.
