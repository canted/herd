# State Matrices

## Purpose

Define the states that need explicit interaction design before implementation. Herd's main UX risk is unspecified state, especially around mobile permissions, timing, independent Program cursors, degraded behavior, and recovery.

## Participant Lifecycle

| State | Entry Condition | Available Actions | Exit Condition | UI Notes |
| --- | --- | --- | --- | --- |
| `unjoined` | User has not opened a valid session link. | Scan QR/open link. | Valid session found. | Outside app or landing state. |
| `joining` | Session link opened after seeing venue signage. | Tap to begin, view privacy/device details. | Audio unlock starts or session invalid. | Show Performance identity without an in-app consent gate. |
| `unlockingAudio` | Join action received. | Tap to unlock if a second gesture is required, retry. | Audio context running or failed. | Required before ready. |
| `checkingCapabilities` | Audio unlocked. | Wait, respond to permission prompts. | Ready/degraded/blocked classification. | Progress by check group. |
| `holding` | Joined before start. | Leave. | Prepare start, force holding, disconnect. | Full-screen holding pattern. |
| `prepareStart` | Server broadcasts scheduled start. | Wait. | Start time reached or cancelled. | Countdown if useful. |
| `live` | Start confirmed and transport running. | Voice-local actions. | End, emergency stop, failure. | Visualizer first. |
| `recovering` | Audio/network/visibility issue detected. | Resume, retry, wait, leave. | Rejoined live or failed. | Preserve timing, skip stale events. |
| `ended` | Performance ended. | Leave. | New session. | Minimal closing state. |

## Participant Capability Matrix

| Capability | Ready | Degraded | Blocked |
| --- | --- | --- | --- |
| Clock sync | Offset/jitter within threshold. | Usable but unstable. | Too poor for timed playback. |
| Assets | All required assets loaded and decoded. | Optional assets missing or fallback available. | Required assets missing. |
| Audio | Context running and test passed as far as browser can tell. | Audio unlocked but output audibility unknown. | Audio cannot start. |
| Microphone | Granted when required. | Denied but non-spatial fallback exists. | Required and no fallback exists. |
| Motion | Granted when required. | Denied but shaker fallback exists. | Required and no fallback exists. |
| Browser support | Required APIs available. | Optional APIs unavailable. | Required runtime APIs unavailable. |
| Visibility | Foreground and active. | Temporarily backgrounded but recovered. | Cannot stay active enough to participate. |

## UI Choice Application

| Apply Boundary | Best For | Participant Feedback | Authoring Warning |
| --- | --- | --- | --- |
| `immediate` | Non-musical or explicitly safe state changes. | "Choice applied." | Warn if Program jump or audible change is unsafe. |
| `nextStep` | Tight sequencer-level variation. | "Applies on next step." | Needs clear timing semantics. |
| `nextBeat` | Fast musical response. | "Applies on next beat." | Risky with poor sync. |
| `nextBar` | Phrase-level changes. | "Applies next bar." | Good for visible feedback. |
| `patternLoopEnd` | Default UI choices and Program queues. | "Choice received. Applies next loop." | Recommended default. |
| `patternRunEnd` | Completion-driven transitions. | "Choice received. Applies when this pattern finishes." | Needs timeout/default handling. |
| `programEnd` | Major section changes. | "Choice received. Applies next section." | Useful for large group changes. |

## Program Cursor States

| State | Meaning | Host Treatment | Participant Treatment |
| --- | --- | --- | --- |
| `independent` | Participant progresses by local Composition logic. | Show distribution, not error. | No visible operational UI. |
| `queued` | Participant has a queued next Program. | Show queued count if meaningful. | Show choice acknowledgment if user caused it. |
| `lockstep` | Composition expects synchronized Program. | Warn on divergence. | Recover at safe boundary if forced. |
| `boundedCatchUp` | Lagging clients may be forced forward. | Show threshold and lagging clients. | Transition at safe boundary. |
| `forced` | Host has forced Program. | Log and mark as override. | Follow server command at safe boundary unless emergency. |

## Voice Assignment States

| State | Meaning | UI Needs |
| --- | --- | --- |
| `assigned` | Participant has one active Voice. | Normal execution. |
| `pendingBoundary` | New Voice is queued but not applied. | Participant choice feedback if relevant. |
| `fallbackVoice` | Assignment failed and Voice 1 is used. | Host and authoring warnings. |
| `emptyVoice` | A Voice has no Participants. | Valid unless Composition expects minimum count. |
| `overCapacity` | More Participants than desired for Voice. | Host warning and optional balancing policy. |
| `hostAssigned` | Host manually assigned Voice. | Log override and show in Participant detail. |

## Recovery Matrix

| Failure | Client Behavior | Host Dashboard Behavior | Authoring Implication |
| --- | --- | --- | --- |
| No microphone | Continue unlocated where possible. | Show mic unavailable. | Warn if no positioning fallback. |
| No motion | Use shaker fallback or silence for section. | Show motion unavailable. | Warn if no shaker fallback. |
| Audio suspended | Prompt tap to resume; visual may continue. | Show audio not running. | Prefer visual fallback where possible. |
| Page backgrounded | Resync on return, skip stale events. | Show visibility/background status. | Avoid relying on hidden continuous interaction. |
| Bad network | Continue local playback; reconnect. | Show network degraded and last heartbeat. | Do not make every event server-triggered. |
| Server restart | Continue temporarily if possible. | Dashboard reconnects or shows session lost. | Early prototype may end Performance. |
| Muted device | Browser may not know. | Show audio unlocked, not audibility. | Include setup instructions/test tone. |
| Late join | Sync and enter by Composition policy. | Show late join state. | Author late-join policy and defaults. |

## Positioning States

| State | Entry Condition | Behavior | UI Treatment |
| --- | --- | --- | --- |
| `notRequired` | Composition does not need positioning. | No mic/scan flow. | Hide positioning checks unless lab/debug. |
| `calibrating` | Host or Composition requests scan. | Server schedules chirp slots. | Show calibration progress to Host; minimal Participant UI. |
| `fresh` | Recent high-confidence position. | Use position-aware behavior. | Normal status. |
| `stale` | Reusing previous position within limit. | Use reduced-confidence position. | Mild warning in Host dashboard. |
| `unlocated` | Insufficient detections. | Use fallback timing/effects. | Host warning; Participant usually does not need detail. |
| `disabled` | Host or policy disables positioning. | Non-spatial fallback. | Log and show active fallback. |
| `failedScan` | Scan quality too poor. | Do not update coordinates. | Show bad scan, not misleading layout. |

## Host Readiness States

| State | Criteria | Primary CTA | Secondary CTA |
| --- | --- | --- | --- |
| `ready` | Quorum healthy across required checks. | Start. | Review details. |
| `degraded` | Performance can run with reduced behavior. | Start with warning. | Fix issues, disable feature, wait. |
| `blocked` | Required behavior likely fails. | Fix issues. | Explicit override only if product policy allows. |
| `starting` | Start requested, prepareStart broadcast. | Cancel if allowed. | Watch confirmations. |
| `live` | startConfirmed sent and transport running. | Monitor. | Intervention controls. |
| `holdingForced` | Host forced holding pattern. | Resume/queue Program. | Stop. |
| `stopped` | Performance ended or emergency stop. | Archive/export. | Restart if supported. |

## Authoring Validation Severity

| Severity | Meaning | Blocks Export | Blocks Rehearsal | Example |
| --- | --- | --- | --- | --- |
| Error | Composition cannot run safely or deterministically enough. | Yes | Usually yes | Missing required asset. |
| Warning | Composition can run but may degrade or surprise the author. | No | No | Many Participants may fall back to Voice 1. |
| Info | Helpful observation. | No | No | Empty Voice exists intentionally. |

## Privacy And Consent States

| State | Meaning | Required UX |
| --- | --- | --- |
| Normal operation | No raw audio retained. | Physical venue notice, lightweight join screen, and privacy/device details link. |
| Mic positioning | Raw audio processed locally; measurements uploaded. | Explain signal detection, not speech recording. |
| Motion interaction | Motion affects sound/visuals locally unless shared state is needed. | Explain behavior and fallback. |
| Diagnostic recording | Raw audio may be captured. | Separate Host and Participant consent. |
| Export analytics | Logs/measurements retained after event. | Host-facing retention controls and documentation. |
