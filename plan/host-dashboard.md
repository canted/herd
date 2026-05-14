# Host Dashboard Spec

This document describes the live Performance control surface for the Host.

## Product Goal

The Host dashboard should make a live Herd Performance understandable and controllable without exposing the full authoring interface.

The Host needs confidence that clients are ready, timing is synchronized, audio is running, permissions are acceptable, and the Performance can recover from common failures.

## Primary Views

The Host dashboard should include:

- Performance setup
- Lobby
- Calibration
- Live Performance
- Participants
- Health
- Emergency controls
- Logs

## Performance Setup

Before opening the lobby, the Host selects:

- Composition
- venue/session name
- whether late join is allowed
- fallback behavior

The dashboard should show Composition warnings before the Host starts.

## Lobby View

The Lobby view is used while Participants join.

It should show:

- join QR code
- join URL
- Participant count
- ready count
- clock sync status
- asset download status
- permission status
- audio unlock status
- device compatibility warnings
- start readiness

The Host should be able to keep Participants in a holding pattern before the Performance begins.

## Calibration View

Calibration prepares timing, audio, motion, and positioning.

It should show:

- clock sync quality
- motion permission count
- audio output test status
- fallback recommendation
- if Composition uses beacon positioning:
  - microphone permission count
  - beacon candidates
  - positioning mode selection
  - beacon strategy
  - room-positioning confidence
  - selected Beacons
  - acoustic scan quality

The Host should be able to rerun calibration, disable positioning, or continue with degraded behavior.

## Live Performance View

The Live Performance view should show the current state at a glance.

It should include:

- elapsed Performance time
- Voice population
- Program cursor distribution
- global flags
- UI choice counts
- positioning mode
- active fallback mode

The Host should be able to manually queue or force a Program for all Participants or selected Participants when the Composition allows override. Normal operation should not assume every Participant shares one active Program.

## Participant View

The Participant view lists connected devices.

Per Participant, show:

- Participant ID or short label
- local Program cursor
- assigned Voice
- clock sync quality
- network quality
- audio state
- visibility state
- permission state
- positioning state
- last heartbeat
- battery if available

The Host should be able to mark a Participant ignored, force reconnect instructions, or inspect recent state changes.

## Health View

The Health view summarizes system risk.

Recommended health groups:

- clock sync
- network
- audio
- permissions
- positioning
- server
- assets
- Program progression for Compositions that opt into shared progression rules

Each group should show:

- healthy count
- degraded count
- failed count
- recommended action

## Emergency Controls

Emergency controls should be visible but protected from accidental use.

Controls:

- stop Performance
- pause transport if supported
- force holding pattern
- disable positioning
- disable shaker sections
- mute all clients if technically possible
- force specific Program
- restart selected Program cursor
- broadcast reconnect instruction

Emergency actions should be logged with Host ID and timestamp.

## Logs

The dashboard should keep a compact event log:

- lobby opened
- Participant joined
- Participant became ready
- calibration started
- calibration result
- Performance start requested
- start confirmed
- Program cursor changed
- Host override
- fallback mode entered
- server health warning
- Participant disconnected

Logs are useful during rehearsal and for diagnosing installation problems.

## Readiness Rules

Host readiness is the dashboard's pre-start classification of whether the current Performance can begin with the selected Composition and connected Participants.

It combines:

- Composition warnings and blocking errors
- Participant count against expected/minimum/maximum counts
- asset load and decode status
- clock sync quality
- audio unlock status
- required microphone, motion, and capability status
- calibration and positioning quality when required
- active fallback policy

Before start, the dashboard should classify readiness:

- `ready`: enough clients have assets, clock sync, audio unlock, and required permissions
- `degraded`: the Performance can start but some features will be disabled or unreliable
- `blocked`: start would likely fail

The Host can override degraded state. Blocked state should require an explicit override with a warning.

Readiness should not only be raw counts. It should also show the top blockers, the audience-visible impact, and the recommended Host action.

## Design Direction

The dashboard should be dense, calm, and operational.

Avoid a showy public-facing design here. The Host is doing live control work and needs scan-friendly information, clear warnings, and fast access to the few actions that matter.
