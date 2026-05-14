# Interaction Design: Herd App

## Context Capsule

- Request: Generate the recommended interaction design for Herd into a subdirectory under `/plan`.
- Current recommendation: Treat Herd as four connected UX surfaces: Participant client, Host dashboard, Authoring app, and Sonic Positioning Lab, all tied together by shared Performance state.
- Confidence: high.
- Artifact depth: full.
- Evidence used: Observed planning files in `/plan`: `experience.md`, `performances.md`, `host-dashboard.md`, `authoring-ui.md`, `composition-schema.md`, `authority-model.md`, `timing-model.md`, `participant-assignment.md`, `modulation-system.md`, `acoustic-positioning.md`, `audio-engine.md`, `failure-modes.md`, `privacy-and-consent.md`, `phased-implementation.md`, `glossary.md`, `creating-compositions.md`, and `composable-structure.md`.
- Key assumptions: Herd remains web-first, Participants use personal mobile devices, the server coordinates state but does not trigger every local musical event, and the first useful UX work should clarify flows and states before visual polish.
- Blocking questions: None for this interaction-design inventory. Detailed visual style, exact responsive breakpoints, and production component choices can wait.
- Decisions already made: Composition and Performance are separate concepts; Participants execute locally; Hosts own session-level control; most live choices apply at musical boundaries; degraded behavior is preferable to silent failure.
- Constraints discovered: Mobile browser permissions, audio unlock, clock sync, independent Program cursors, local audio scheduling, room positioning uncertainty, physical privacy notice, and live-performance recovery all need explicit UI states.
- Escalations: Acoustic positioning and mobile audio reliability remain technical risks that need lab/prototype validation.
- Suggested next skills: `usability-review`, `scope-decision`, `feasibility-review`.

## Directory Map

| File | Purpose |
| --- | --- |
| `01-cross-role-product-map.md` | Product lifecycle, roles, shared state language, and cross-surface navigation. |
| `02-participant-mobile-client.md` | Audience/performer phone flow from QR join through live interaction and recovery. |
| `03-host-dashboard.md` | Operational dashboard for setup, readiness, calibration, live monitoring, and emergency controls. |
| `04-authoring-app.md` | Composition creation workflow, editors, modulation mode, validation, and preview. |
| `05-sonic-positioning-lab.md` | Standalone positioning test controller and device-client interactions. |
| `06-state-matrices.md` | State rules for lifecycle, permissions, Program cursors, recovery, positioning, and validation. |
| `07-prototype-plan.md` | Prototype sequence, acceptance checks, and handoff questions. |

## Product Surfaces

Herd should be designed as a coordinated system rather than a single app screen.

- Participant client: the live audience or performer device that plays sound, shows visuals, makes choices, reports health, and recovers from failure.
- Host dashboard: the operational control surface for opening a Performance, checking readiness, calibrating, starting, monitoring, and intervening.
- Authoring app: the creative workspace for building Compositions without editing JSON.
- Sonic Positioning Lab: the operator tool for measuring whether acoustic positioning can work on real devices in real rooms.

## Interaction Design Priorities

1. Make live state legible before making it decorative.
2. Make degraded behavior explicit and recoverable.
3. Keep musical-boundary timing visible wherever a user action does not apply immediately.
4. Separate authoring complexity from live Host control.
5. Treat mobile permission and browser failure paths as first-class flows.
6. Design independent Program cursors as normal behavior, not as an error condition.
7. Preserve privacy expectations with physical venue notice, lightweight in-app details, local processing by default, and clear diagnostic opt-ins.
