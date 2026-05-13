# Privacy And Consent

This document defines privacy expectations for Herd Participants and Hosts.

## Principle

Herd should collect the minimum data needed to run a live Performance. Participants should understand which device capabilities are used and why before joining.

The app should be explicit that microphone access is used for signal detection and relative positioning, not for recording speech.

## Participant Consent

Before joining a Performance, Participants should see a concise consent screen explaining:

- the phone will play sound
- the screen will flash or change color
- the app may request microphone access for room positioning
- the app may request motion access for shaker or gesture sections
- the app uses a synchronized clock
- approximate relative position may be computed
- no speech recording is needed for normal operation
- leaving the page may interrupt participation

Consent should be written for audience members, not engineers.

## Microphone Use

Microphone access should be used to detect known acoustic beacon signals.

Recommended rule:

- raw microphone audio is processed locally
- clients upload measurements, not recordings
- uploaded measurements include beacon IDs, timestamps, confidence, SNR, and related detection metadata
- raw audio should not be stored unless a special diagnostic mode is explicitly enabled

If diagnostic recording is ever added, it should require separate Host and Participant consent.

## Motion Use

Motion access may be used for shaker Patterns or modulation.

The app should disclose:

- motion data can affect sound or visuals
- motion data is not needed for all Compositions
- if permission is denied, some sections may use fallback behavior or do nothing on that device

Motion data should normally be evaluated locally. Aggregated or event-level motion outputs can be sent to the server only when the Composition needs shared state.

## Positioning Data

Positioning data is relative, approximate, and room-local.

The system should avoid claiming that it knows exact physical location. It estimates a relative 2D layout useful for artistic effects.

Server-side positioning records should use Participant IDs rather than personal identity.

## Device Identity

Participants should receive a session-scoped Participant ID.

Default behavior:

- IDs are unique within a Performance
- IDs are not reused across unrelated Performances
- IDs are not tied to names, phone numbers, email addresses, or accounts

Persistent identity should be avoided unless a future product requirement clearly needs it.

## Data Retention

Default retention should be short.

Recommended defaults:

- live state exists during the Performance
- logs may be retained for debugging if the Host enables it
- raw audio is not retained
- exported analytics should be aggregate by default
- session data can be deleted after the event

If analytics are kept, the app should document exactly what is retained.

## Host Visibility

The Host dashboard may show operational device state:

- ready status
- local Program cursor
- Voice assignment
- permission state
- clock sync quality
- positioning state
- connection state

The Host should not need personal identity for normal operation.

## Public Installation Copy

A short public-facing notice should be available near the QR code.

Example:

```text
This performance uses your phone as part of a shared sound and light system. The web app may ask for microphone access to detect installation sounds for approximate room positioning, and motion access for gesture-based sections. It does not need to record speech. You can leave at any time by closing the page.
```

## Security Expectations

The Performance join URL should be hard to guess.

Recommended safeguards:

- random join code
- Host can close lobby
- Host can remove malfunctioning Participants
- server validates Composition package revisions
- clients ignore messages from unknown sessions
- uploaded measurements are scoped to one Performance
