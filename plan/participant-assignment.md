# Participant Assignment

This document defines how Participants are assigned to Voices during a Performance.

## Principle

Participant assignment is part of the Composition. Different Compositions can assign Participants in different ways.

Assignment can happen through UI choice, randomization, position, Host action, Program rules, or server-provided aggregate state. The app should provide safe defaults, but the artist is responsible for designing assignments that make sense for the piece.

## Default Rule

If assignment cannot be resolved, the Participant falls back to Voice 1.

This fallback should prevent silence or broken state. It should not hide authoring problems in rehearsal mode; the Host dashboard and authoring preview should warn when many Participants fall back.

## Assignment Sources

Possible assignment sources:

- UI choice
- random assignment
- balanced random assignment
- local Program rule
- previous Program assignment
- relative room position
- Participant join order
- Host assignment
- server-provided group counts
- device capability

## Assignment Timing

Assignments should normally apply at a musical boundary:

- immediately for lobby or pre-show state
- next Pattern loop for in-performance UI choices
- next Program for major group changes

The Composition should specify the boundary.

## Voice Capacity

The initial model allows one to four Voices per Program. Multiple Participants may share a Voice.

The Composition can optionally define:

- minimum desired Participants per Voice
- maximum desired Participants per Voice
- balancing policy
- fallback Voice
- behavior for empty Voices

Empty Voices should be valid. A Composition may use this intentionally.

## Late Join

New Participants can join during a Performance if the Host allows it.

The server should:

- synchronize the new client's clock
- send the full Composition package
- send current Performance state
- send Program cursor distribution
- send current global flags

The Composition then decides whether the Participant joins immediately, waits for the next loop, waits for the next Program, or remains in a holding behavior.

If positioning data is unavailable, the Participant should have `position.state = "unlocated"` and continue with non-position-dependent behavior.
