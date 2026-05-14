# Web Acoustic Relative Positioning Plan

## Summary

Build a web-based room-positioning system where a subset of phones act as acoustic beacons and the remaining phones listen. The system periodically estimates a relative 2D layout of devices using audio time-of-flight measurements, then uses that layout to trigger room-scale visual/audio effects such as sweeps, ripples, and cascades.

The coordinate system is intentionally arbitrary: no north/south/east/west alignment is required. The layout only needs to preserve relative positions well enough for spatial effects.

Default target: **coarse-to-good gallery positioning**, not survey-grade accuracy. Aim for stable ordering and approximate spacing, with graceful degradation under noise.

## System Design

- Use a **web app** with microphone permission and Web Audio. The audio engine variant is defined in `audio-engine.md`; early positioning work should validate targeted Worker/WASM or AudioWorklet kernels before requiring a full WASM engine.
- Use a central coordination server over WebSocket/WebRTC data channel for:
  - session membership
  - beacon selection
  - chirp schedule
  - measurement upload
  - layout solving
  - effect cue broadcast
- Assign each device one of two roles:
  - **Beacon device**: emits uniquely coded chirps during scheduled time slots and may also listen.
  - **Listener device**: records chirps, estimates arrival times, and uploads measurements.
- Select **5-8 beacon devices** by default for a gallery room.
  - Prefer stationary or semi-stationary phones: staff devices, phones placed on tables/plinths, or volunteer devices instructed to stay still.
  - Avoid relying on arbitrary moving visitors as beacons unless the experience tolerates unstable geometry.
- Refresh location periodically, not continuously.
  - Default scan interval: every **5-10 seconds**.
  - Default scan duration: **1-3 seconds**, depending on beacon count and room noise.
- Allow Composition-triggered scan requests.
  - A Composition can request a fresh scan before a movement that needs updated room layout.
  - The artist should be able to leave silence or sparse audio around the scan window.
  - The server still owns the exact chirp schedule, beacon slots, guard intervals, and fallback behavior.
- Use **coded chirps** rather than simple tones.
  - Each beacon gets a unique ID encoded via spread-spectrum chirp, pseudo-random sequence, or frequency-swept signature.
  - Chirps should support cross-correlation detection in noise.
  - Prefer near-ultrasonic only if testing confirms target phones reproduce and record it reliably; otherwise use brief audible chirps masked by the installation sound design.

## Positioning Protocol

- During each scan round:
  - Server announces scan epoch, trigger source, beacon list, chirp codes, and time slots.
  - Beacons emit chirps in non-overlapping slots with guard intervals.
  - All devices record the full scan window.
  - Each listener detects chirp arrivals using cross-correlation against known beacon codes.
  - Each listener uploads per-beacon measurements:
    - detected/not detected
    - arrival timestamp
    - confidence score
    - signal-to-noise ratio estimate
    - correlation peak width
    - optional multipath indicators
- Beacon geometry:
  - Measure beacon-to-beacon distances where possible.
  - Solve beacon coordinates in arbitrary 2D space.
  - Set first beacon to `(0,0)`, second beacon to the x-axis, and solve the rest by least squares.
  - Mirror/rotation ambiguity is acceptable.
- Listener geometry:
  - Estimate each listener position from distances or arrival-time differences to beacons.
  - Use 4+ beacon detections when available; allow 3 detections as minimum.
  - Use weighted nonlinear least squares, with weights from confidence/SNR.
- Global refinement:
  - Optionally include listener-to-beacon and beacon-to-beacon measurements in one global optimization pass.
  - Smooth positions across scan rounds with a Kalman filter, exponential smoothing, or velocity-limited interpolation.
- Effects:
  - Convert solved coordinates into normalized layout coordinates.
  - Choose effect axes from the solved point cloud, for example principal component axis 1 for a left-to-right sweep.
  - Broadcast effect start time plus per-device delay derived from its coordinate.
  - If a device lacks a fresh position, reuse last known good position with reduced confidence.

## Composition-Triggered Positioning

Positioning scans can be part of the artistic structure of a Composition. A later movement may need fresh position data for a sweep, ripple, or spatial call-and-response, so the Composition can request a scan shortly before that movement.

The request is musical/compositional, but the scan execution is infrastructure-owned:

- the Composition requests the scan and expected window
- the server chooses participating Beacons
- the server schedules exact chirp slots
- clients follow the server scan schedule
- the Composition reads the resulting position state when the next section begins

This lets artists treat positioning as a visible or audible event in the piece while preserving the timing discipline needed for reliable acoustic measurement.

## Robustness Protocol For Noisy Chaotic Environments

- Use **redundant beacons**.
  - Minimum: 3.
  - Default: 6.
  - Robust mode: 8-10.
  - Treat each scan as successful if a listener gets at least 4 high-confidence beacon detections.
- Use **time-slot isolation first**, code separation second.
  - Do not let all beacons emit at once in v1.
  - Add guard intervals long enough for room echoes to decay.
  - Increase guard time in reverberant rooms.
- Run a **pre-show calibration pass**.
  - Measure room noise floor.
  - Test audible vs near-ultrasonic chirp bands.
  - Estimate reverb/multipath severity.
  - Pick chirp duration, frequency band, volume, and guard interval automatically.
- Detect and reject bad measurements.
  - Drop detections below SNR threshold.
  - Drop broad/ambiguous correlation peaks.
  - Drop distances that violate geometric consistency with other beacon distances.
  - Use RANSAC or robust loss functions to avoid one bad beacon corrupting the layout.
- Maintain per-device health state:
  - `fresh`: enough recent high-confidence measurements.
  - `stale`: position reused from previous scans.
  - `unlocated`: insufficient data; assign fallback behavior.
- Use graceful fallbacks:
  - Stale devices continue using last position for a limited time.
  - Unlocated devices join the effect using randomized timing, session-average timing, or nearest previous cluster.
  - If the whole scan quality drops, switch to non-spatial synchronized effects until recovery.
- Handle moving or unstable beacons.
  - Track beacon self-consistency across scans.
  - Demote beacons whose measured distances shift too much.
  - Promote backup beacons when a primary beacon becomes unreliable.
  - Prefer beacon devices with stable signal quality, high battery, foreground tab active, and low motion if accelerometer access is available.
- Repeat scans adaptively.
  - Normal mode: scan every 5-10 seconds.
  - Chaotic/noisy mode: scan more often or lengthen chirps.
  - Quiet/stable mode: scan less often to reduce audible artifacts.
- Separate positioning audio from art audio.
  - Avoid playing loud bells, music hits, or voice prompts during scan windows.
  - Or intentionally mask chirps inside the sound design while keeping their detection band clear.

## Interfaces And Data Shapes

- Client role assignment:
  - `deviceId`
  - `role`: `beacon | listener | backupBeacon`
  - `beaconCode`
  - `scanSchedule`
- Measurement upload:
  - `scanId`
  - `listenerDeviceId`
  - `beaconDeviceId`
  - `arrivalTime`
  - `confidence`
  - `snr`
  - `peakWidth`
  - `detected`
- Solver output:
  - `scanId`
  - `deviceId`
  - `x`
  - `y`
  - `confidence`
  - `state`: `fresh | stale | unlocated`
- Effect cue:
  - `effectId`
  - `serverStartTime`
  - `axis`
  - `duration`
  - `perDeviceDelay`
  - `fallbackMode`

## Test Plan

- Lab test with 4-6 phones in a quiet room.
  - Verify chirp detection, timestamp stability, and rough distance consistency.
- Gallery-room dry run with fixed beacon phones.
  - Test reflections, crowd noise, and beacon placement.
  - Compare solved layout against manually marked positions.
- Stress test with movement.
  - People walking, phones rotating, partial occlusion, pockets, and hand covering.
  - Verify stale/unlocated fallback behavior.
- Noise test.
  - Music playback, conversation, applause-like noise, and overlapping effect audio.
  - Confirm scan confidence drops gracefully instead of producing chaotic coordinates.
- Scale test.
  - 20, 50, and 100 listener devices simulated or real where possible.
  - Verify server load, WebSocket throughput, and solver latency.
- Acceptance criteria:
  - 80%+ of active listener devices receive fresh positions in normal gallery conditions.
  - Spatial effects preserve visibly/audibly plausible ordering.
  - Bad scans do not produce jarring jumps; devices either smooth, go stale, or enter fallback.
  - Full scan-to-effect latency remains acceptable for the art direction, default target under 3 seconds.

## Assumptions

- The app remains web-only.
- Camera is out of scope.
- Microphone access is granted.
- Audio timing/synchronization is considered solved enough for the prototype.
- Beacon phones are ordinary web clients, but the recommended deployment uses stationary or staff-controlled beacon devices.
- The system targets relative 2D layout, not absolute room coordinates.
- Arbitrary rotation and mirror ambiguity are acceptable.
- Position updates are periodic, not continuous.
- Robustness is prioritized over maximum precision.
