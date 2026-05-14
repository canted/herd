# Usability Review: Herd Interaction Design

## Context Capsule

- Request: Use `usability-review` at standard depth on the current Herd planning and interaction design docs.
- Current recommendation: The interaction direction is strong enough to move toward `scope-decision`; physical signage is the normal Participant notice model, Host readiness needs a clear pre-start hierarchy, Step Event Lock Capture must stay distinct from device-level Modulation Mode, and Participant recovery/permission states need precise copy.
- Confidence: medium-high.
- Artifact depth: standard.
- Evidence used: Observed docs in `/plan`, especially `interaction-design/*.md`, `authoring-ui.md`, `modulation-system.md`, `composition-schema.md`, `host-dashboard.md`, `privacy-and-consent.md`, `failure-modes.md`, `timing-model.md`, `authority-model.md`, and `participant-assignment.md`.
- Key assumptions: The first buildable slice should support rehearsal-quality Participant and Host flows before full authoring or production positioning. Physical venue signage carries broad audience notice; browser permission prompts and concise in-app device details remain necessary.
- Blocking questions: What legal/venue standard should govern the physical notice? What is the minimum supported Host device size? Is the first slice intended for rehearsal operators only, or for public audience use?
- Decisions already made: Web-first client; Participants execute locally; Host owns session controls; most choices apply at musical boundaries; degraded behavior is preferable to silent failure; authoring uses Step Events, Instrument Triggers, Visualizer Triggers, Parameter Locks, and target-owner Modulation Mode.
- Constraints discovered: Mobile browser audio unlock, mic/motion permissions, clock sync, foreground/page visibility, independent Program cursors, acoustic-positioning uncertainty, and live recovery all create user-visible states.
- Escalations: Do not scope public deployment until physical notice copy, flashing/motion safety, emergency stop, and diagnostic data-retention behavior have explicit review.
- Suggested next skills: `scope-decision`, then `delivery-planning`; use `feasibility-review` before scope if acoustic positioning or mobile audio timing is part of the first slice.

## Primary User Flow

Herd has four primary workflows:

- Participant: scan QR, understand the phone role, unlock audio, pass capability checks, wait in holding, participate live, respond to prompts, recover from interruption, and exit.
- Host: select Composition, open lobby, monitor readiness, calibrate if needed, start, monitor live health, intervene safely, end, and review logs.
- Author: create/open Composition, arrange Programs, configure Voices and vertical device stacks, preview multi-device behavior, fix validation issues, package or rehearse.
- Positioning operator: create lab session, connect devices, assign roles, run scans, inspect detection quality, stop audio, and export evidence.

The design is coherent at the system level. The usability risk is that each surface is still carrying several advanced concepts at once: permission readiness, musical timing, device health, Program divergence, parameter locks, modulation, and approximate positioning.

## Task Walkthrough

| Step | User Goal | System Response | Risk | Needed State/Copy |
| --- | --- | --- | --- | --- |
| Participant scans QR | Join quickly without onboarding friction. | Landing shows session name, one-line phone role, tap-to-begin. | Users may miss the physical sign or need details later. | Use physical venue notice as the primary model, plus an in-app privacy/device details link and browser prompts when needed. |
| Participant starts audio | Unlock audio with one obvious action. | Tap starts audio and capability checks. | Join landing and audio unlock may become two consecutive taps if implemented literally. | Combine "Tap to begin" and audio unlock into one gesture where possible; if not, explain why the second tap exists. |
| Participant grants/denies mic or motion | Continue if the piece can degrade. | Just-in-time permission prompt and readiness classification. | Prompting during the live piece would be disruptive; prompting too early creates friction. | Preflight only capabilities required by the loaded Composition; copy should say "This piece uses..." not generic capability text. |
| Participant waits in holding | Know device is ready and page must stay open. | Full-screen holding visual, ready text, optional QR. | Showing QR on participant phones may clutter the artwork and confuse whether this device is a sign or a participant. | Treat participant QR as optional Host-enabled "recruitment mode," not default holding UI. |
| Participant chooses during prompt | Make a choice and trust it registered. | Selected state appears; delayed boundary copy may appear. | "Applies next loop" is musician-readable but may not be audience-readable. | Use audience copy such as "Choice received" by default; expose boundary only if it matters or is part of the artwork. |
| Participant recovers from audio/background/network | Rejoin without derailing the room. | Resume/reconnect/resync prompt. | "Rejoin momentarily" hides whether the user must tap or wait; audio recovery and network recovery need different actions. | Separate actionable recovery states: "Tap to resume audio," "Reconnecting," "Back in sync." |
| Host opens lobby | Get devices joined and understand readiness. | Dashboard shows QR, counts, checks, start state. | The dashboard can become metric-heavy; readiness needs top-level cause ranking. | Add "Top blockers" and "Recommended action" above raw counts. |
| Host starts degraded | Decide whether degraded start is acceptable. | Start warning/override. | "Degraded" can hide very different consequences: no audio on some devices vs no positioning vs no motion. | Degraded override must state audience-visible impact: "6 devices visual-only," "positioning disabled," etc. |
| Host monitors live | Understand what is happening now. | Voice population, Program cursor distribution, flags, fallback. | Program cursor divergence is normal but still unfamiliar; Hosts may overreact. | Label policy in-context: "Independent cursors: expected" or "Lockstep: 3 lagging." |
| Host uses emergency controls | Act fast without accidents. | Emergency panel with confirmations. | Stop, holding, mute, disable positioning, force Program need different confirmation strength. | Tier emergency actions by reversibility and audible impact. |
| Author edits Step Events | Program sound/visual rhythm and locks. | Step grid with Instrument/Visualizer/Parameter Lock layers. | Hidden layers can make steps look empty when they contain data in another layer. | Step cells need aggregate badges showing hidden Instrument Trigger, Visualizer Trigger, and Parameter Locks. |
| Author captures a Parameter Lock | Select Step Event, create lock, touch target control. | Target control stores lock value. | Lock Capture and device-level Modulation Mode both involve touching target controls; modes can conflict if both are armed. | Step Events have Lock Capture only; Modulation Mode belongs to Instruments/Visualizers. Make the armed states mutually exclusive with distinct styling and escape/cancel behavior. |
| Author uses Modulation Mode | Route source to Instrument/Visualizer target. | Target-owning device overlays modulatable controls. | Target-owner scope is now correct, but sources may still feel detached from affected controls. | Show source, target, scope, amount, range, and apply boundary directly on affected controls. |
| Positioning operator runs scan | Get trustworthy measurement evidence. | Controller shows roles, profiles, detections, SNR, export. | Layout preview may imply false precision. | Default to confidence table first; label layout as approximate relative layout. |

## Interaction Alternatives

| Alternative | Pros | Cons | Best For | Risk |
| --- | --- | --- | --- | --- |
| Venue notice + lightweight join | Lowest Participant friction; matches installation context. | Needs venue/legal review; some users may miss signage. | Public performance entry. | In-app details link must still be discoverable. |
| In-app consent checklist | Strong explicit acknowledgment. | High friction; feels administrative; bad for audience flow. | Lab/test sessions or diagnostic recording. | May reduce participation and break mood. |
| Single Host "Run" workspace | Keeps setup/lobby/live/health in one progressive control surface. | Can get dense. | Live operation under pressure. | Needs careful hierarchy. |
| Tabbed Host dashboard | Clear separation by domain. | Host may hunt across tabs during failures. | Rehearsal/debug workflows. | Emergency response slower. |
| Pattern layers as toggles | Reduces visual clutter and matches trigger types. | Hidden data risk. | Step sequencer power use. | Requires aggregate step badges. |
| Pattern layers as always-visible lanes | More explicit data visibility. | Crowded at 64 steps. | Desktop authoring and debugging. | Lower composition speed. |
| Modulation Mode only inside target device | Clear ownership and less global ambiguity. | Cross-device sources may feel less discoverable. | Current design direction. | Needs source browser and target annotations. |

## Content And State Inventory

- Default:
  - Participant: session name, one-line phone role, tap-to-begin/audio unlock, ready holding.
  - Host: readiness summary, top blockers, recommended action, start state.
  - Author: active Composition, Program, Voice, selected Step Event, validation status.
  - Lab: session devices, roles, scan profile, stop-all-audio.
- Empty:
  - No Composition yet; no Programs; no Voices; no assets; no Participants; no lab devices; no scan results.
- Loading:
  - Participant asset loading, audio decode, clock sync, reconnecting, resyncing.
  - Host waiting for confirmations, calibration running, logs loading/exporting.
  - Author preview booting simulated Participants, package validation running.
- Error:
  - Invalid/closed session link, failed audio unlock, asset decode failure, unsupported browser, server disconnected, invalid Composition package.
- Permission denied:
  - Mic denied with positioning fallback; mic denied without fallback; motion denied with shaker fallback; motion denied without fallback.
- Partial success:
  - Degraded start; some devices visual-only; some devices unlocated; some Voices empty; package exports with warnings.
- Offline/timeout:
  - Participant reconnect; Host dashboard reconnect; late heartbeat; clock sync stale; scan timed out; export failed.
- Success:
  - Participant ready/rejoined/choice received; Host start confirmed; calibration complete; package valid; scan exported.

## Accessibility Checklist

- Keyboard:
  - Host dashboard tables, emergency controls, participant drawer, logs, and authoring controls need full keyboard navigation.
  - Authoring knobs/sliders need editable numeric fields and stepper controls.
- Screen reader semantics:
  - Participant prompts and recovery states need live regions.
  - Host health counts need labels, not color-only status.
  - Step cells need accessible names: step number, Instrument Trigger, Visualizer Trigger, Parameter Locks.
- Focus management:
  - Browser permission prompts, recovery modals, emergency confirmations, and lock-capture armed mode need deterministic focus entry/exit.
  - Pressing Escape should cancel lock capture or Modulation Mode before closing broader panels.
- Contrast:
  - Participant operational text must remain readable over full-screen visuals.
  - Host warning states need icons/text in addition to color.
- Motion:
  - Participant visualizer needs a reduced-flash/reduced-motion policy, especially for public use.
  - Shaker interactions need non-motion fallback and should not punish users who cannot or do not want to shake.
- Forms/errors:
  - Authoring validation should link from issue to control.
  - Host setup warnings should distinguish blocking errors from rehearsal warnings.
- Responsive behavior:
  - Participant is mobile-first.
  - Host should define a minimum supported viewport. Below that, use monitor-only mode or explicit unsupported warning.
  - Authoring can be desktop-first, but vertical device stacks need collapse, sticky headers, and selected-device navigation.

## Friction And Edge Cases

- The physical-notice model now needs consistent copy across signage, join screen details, and browser permission prompts.
- "Tap to begin" plus "Start audio" can become two taps; reduce to one user gesture when possible.
- Browser permission prompts can appear at bad moments if capability preflight is not Composition-aware.
- Participant QR display in holding can conflict with the phone-as-artwork model.
- The Host dashboard has many views; incident workflows should not require switching tabs repeatedly.
- Emergency actions vary in reversibility. Treating them uniformly creates either accidental-stop risk or slow-recovery risk.
- Hidden Pattern layers can cause destructive edits if a step appears empty while another layer contains data.
- Step Event Lock Capture and Instrument/Visualizer Modulation Mode are both target-touch workflows; Step Events do not have Modulation Mode, and the armed states must be visually distinct and mutually exclusive.
- "Independent Program cursors" is correct but non-obvious. Host and Author views need policy labels and examples.
- "Relative positioning" can still be misread as tracking. Participant-facing copy should avoid location-like language unless needed.
- Authoring vertical stacks will get long with 4 Voices and expanded devices. The design needs collapse, active Voice navigation, and search/jump.
- Sonic Positioning Lab has safety implications: high-gain, near-ultrasonic, repeated scan, and raw diagnostic recording must be guarded.

## UX Risks That Affect Scope

1. **Do not scope public notice/diagnostics casually.**
   The first public slice uses physical signage for normal notice, but still needs a privacy details link, browser permission copy, and data-retention language. Diagnostic recording remains a separate explicit consent flow.

2. **Do not build full authoring before proving the Step Event editor.**
   The Step Event/layer/Lock Capture model and the separate Instrument/Visualizer Modulation Mode model are central and complex. Prototype them before building broad editors.

3. **Host readiness needs a first-class hierarchy.**
   The buildable Host slice should include top blockers and recommended actions, not only counts.

4. **Emergency controls need design before implementation.**
   Stop, force holding, disable positioning, disable shaker, and force Program should have different confirmation and recovery behavior.

5. **Positioning should stay in lab mode until trust is earned.**
   Public positioning UX should wait until the lab can show bad scans, stale/unlocated devices, and safe fallbacks clearly.

6. **Accessibility is not a polish phase here.**
   Flashing visuals, dark-room interaction, motion/shaker behavior, keyboard Host control, and screen-reader prompt states affect the first usable slice.

## Recommended Validation

- Run a design review before `scope-decision` using four walkthroughs:
  - First-time Participant joins and makes one choice.
  - Host starts a degraded rehearsal and handles one failure.
  - Author creates one Program with one Voice, one Step Event layer change, one Parameter Lock, and one modulation route.
  - Positioning operator runs one scan and identifies one bad measurement.
- Conduct lightweight usability tests for Participant and Host prototypes with 3-5 people each before public rehearsal.
- Use expert review rather than general user testing for the Authoring Step Event/Modulation prototype, ideally with users familiar with Elektron or modular/DAW concepts.
- Validate Sonic Positioning Lab operationally with real devices before usability testing the integrated positioning flow.

## Recommendation For Next Skill

Use `scope-decision` next at standard depth. Scope should likely choose a first slice around:

1. Participant join/audio unlock/holding/live prompt/recovery.
2. Host setup/lobby/readiness/start/stop/logs.
3. Minimal runtime fixture support for timed Step Events, Instrument Trigger, Visualizer Trigger, and one UI choice.

Keep full authoring and positioning integration behind prototype gates.
