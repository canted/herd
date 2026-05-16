import { useEffect, useRef, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Mic,
  Play,
  Radio,
  Smartphone,
  Square,
  Volume2,
} from "lucide-react";
import {
  chirpProfiles,
  createPositioningSignalSamples,
  type ChirpProfile,
} from "./model";

interface LiveLabDevice {
  id: string;
  label: string;
  joinedAt: number;
  lastSeenAt: number;
  audio: "unknown" | "ready" | "blocked";
  mic: "unknown" | "granted" | "denied";
  sampleRate: number | null;
}

interface LiveMeasurement {
  deviceId: string;
  label: string;
  scanId: string;
  detected: boolean;
  distanceMeters: number | null;
  arrivalTimeMs: number | null;
  confidence: number;
  snr: number | null;
  peakWidthMs: number | null;
  processingMs: number;
}

interface LiveScan {
  id: string;
  profileId: string;
  createdAt: number;
  startAt: number;
  durationMs: number;
  status: "scheduled" | "running" | "complete" | "stopped";
  measurements: LiveMeasurement[];
}

interface LiveLabState {
  name: string;
  serverTimeMs: number;
  devices: LiveLabDevice[];
  latestScan: LiveScan | null;
}

interface BeaconSelfMeasurement {
  scanId: string;
  detected: boolean;
  latencyMs: number | null;
  confidence: number;
  snr: number | null;
  processingMs: number;
}

interface ClockSync {
  offsetMs: number;
  rttMs: number;
  samples: number;
  syncedAt: number;
}

interface TimedJson<T> {
  body: T;
  sentAt: number;
  receivedAt: number;
  rttMs: number;
}

type AudioStatus = "locked" | "ready" | "blocked";
type MicStatus = "unknown" | "available" | "prompt" | "granted" | "denied" | "blocked";

const configuredJoinOrigin = import.meta.env.VITE_POSITIONING_LAB_PUBLIC_ORIGIN as string | undefined;
const configuredServerBase = import.meta.env.VITE_SERVER_URL as string | undefined;
const runsOnLabDevServer = import.meta.env.DEV || isLocalDevPort("5176");
const serverBase = normalizeOrigin(
  runsOnLabDevServer ? configuredServerBase ?? window.location.origin : window.location.origin,
);
const deviceIdKey = "herd.positioningLab.deviceId.v1";
const deviceLabelKey = "herd.positioningLab.deviceLabel.v1";
const speedOfSoundMetersPerMs = 0.343;
const positioningLabBasePath = "/positioning-lab";

interface WebKitAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function isLocalDevPort(port: string): boolean {
  return (
    window.location.port === port &&
    ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(window.location.hostname)
  );
}

export function App() {
  if (window.location.pathname.includes("positioning-device")) {
    return <DeviceClient />;
  }

  return <ControllerApp />;
}

function ControllerApp() {
  const [sessionName, setSessionName] = useState("distance-test");
  const [profileId, setProfileId] = useState("coded-ultrasonic-noise");
  const [labState, setLabState] = useState<LiveLabState | null>(null);
  const [notes, setNotes] = useState("");
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [progressNow, setProgressNow] = useState(Date.now());
  const [beaconMicStatus, setBeaconMicStatus] = useState<MicStatus>("unknown");
  const [beaconSampleRate, setBeaconSampleRate] = useState<number | null>(null);
  const [beaconMeasurement, setBeaconMeasurement] = useState<BeaconSelfMeasurement | null>(null);
  const [controllerClock, setControllerClock] = useState<ClockSync | null>(null);
  const profile = chirpProfiles.find((candidate) => candidate.id === profileId) ?? chirpProfiles[0]!;
  const joinOrigin = normalizeOrigin(
    runsOnLabDevServer ? configuredJoinOrigin ?? window.location.origin : window.location.origin,
  );
  const joinUrl = buildDeviceJoinUrl(joinOrigin, sessionName);
  const audioRef = useRef<AudioContext | null>(null);
  const beaconStreamRef = useRef<MediaStream | null>(null);
  const latestScan = labState?.latestScan ?? null;
  const scanProgress = latestScan === null ? null : getScanProgress(latestScan, progressNow);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 220,
      color: {
        dark: "#10100e",
        light: "#f4f0e8",
      },
    }).then((dataUrl) => {
      if (!cancelled) setQr(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const next = await fetchLabState(sessionName);
        if (!cancelled) setLabState(next);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Unable to reach lab server.");
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 900);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionName]);

  useEffect(() => {
    if (latestScan === null || latestScan.status === "complete" || latestScan.status === "stopped") return;
    const id = window.setInterval(() => setProgressNow(Date.now()), 120);
    return () => window.clearInterval(id);
  }, [latestScan?.id, latestScan?.status]);

  async function runDistanceScan() {
    try {
      setStatus("Syncing clocks...");
      setBeaconMeasurement(null);
      const context = audioRef.current ?? createAudioContext();
      audioRef.current = context;
      await context.resume();
      if (context.state !== "running") {
        setStatus("Audio is still locked. Click Run distance scan again.");
        return;
      }

      let beaconStream = beaconStreamRef.current;
      if (beaconStream === null) {
        setStatus("Arming beacon mic...");
        beaconStream = await requestBeaconMic(context);
      }

      const syncedClock = await syncServerClock(sessionName, 6);
      const timedResponse = await postJsonWithTiming<{ serverTimeMs: number; scan: LiveScan; session: LiveLabState }>(
        `/api/positioning-lab/${encodeURIComponent(sessionName)}/scans`,
        { profileId },
      );
      const response = timedResponse.body;
      const responseClock = createClockSyncSample(response.serverTimeMs, timedResponse.sentAt, timedResponse.receivedAt);
      const clock = refineClockSync(syncedClock, responseClock);
      setControllerClock(clock);
      setLabState(response.session);
      setProgressNow(Date.now());
      const scheduleDelayMs = response.scan.startAt - estimateServerNow(clock);
      scheduleLeftSignal(context, profile, scheduleDelayMs);
      void measureBeaconSelf(response.scan, context, beaconStream, scheduleDelayMs)
        .then((measurement) => {
          setBeaconMeasurement(measurement);
          setStatus(
            measurement.detected && measurement.latencyMs !== null
              ? `Beacon self-latency ${measurement.latencyMs.toFixed(1)}ms measured. Phone arrivals will be corrected.`
              : "Beacon mic did not detect its own signal.",
          );
        })
        .catch((error) => {
          setBeaconMeasurement(null);
          setStatus(error instanceof Error ? error.message : "Beacon self-recording failed.");
        });
      setStatus(`Clock synced to ${clock.rttMs.toFixed(0)}ms RTT. ${profile.band} signal starts in ${formatSeconds(Math.max(0, scheduleDelayMs))}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not schedule signal.");
    }
  }

  async function requestBeaconMic(context: AudioContext): Promise<MediaStream> {
    if (!window.isSecureContext) {
      setBeaconMicStatus("blocked");
      throw new Error("Beacon microphone requires HTTPS or localhost.");
    }
    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setBeaconMicStatus("blocked");
      throw new Error("This browser does not expose microphone capture.");
    }

    setBeaconMicStatus("prompt");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    beaconStreamRef.current?.getTracks().forEach((track) => track.stop());
    beaconStreamRef.current = stream;
    setBeaconMicStatus("granted");
    setBeaconSampleRate(context.sampleRate);
    return stream;
  }

  async function enableBeaconMic() {
    try {
      const context = audioRef.current ?? createAudioContext();
      audioRef.current = context;
      await context.resume();
      await requestBeaconMic(context);
      setStatus("Beacon mic armed. The controller will record its own signal during scans.");
    } catch (error) {
      setBeaconMicStatus((current) => current === "blocked" ? "blocked" : "denied");
      setStatus(error instanceof Error ? error.message : "Could not arm beacon mic.");
    }
  }

  async function testSignal() {
    try {
      const context = audioRef.current ?? createAudioContext();
      audioRef.current = context;
      await context.resume();
      if (context.state !== "running") {
        setStatus("Audio is still locked. Click Test signal again.");
        return;
      }
      scheduleLeftSignal(context, profile, 80);
      setStatus(`Playing local left-channel ${profile.band} signal.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not play test signal.");
    }
  }

  function stopAudio() {
    const context = audioRef.current;
    audioRef.current = null;
    beaconStreamRef.current?.getTracks().forEach((track) => track.stop());
    beaconStreamRef.current = null;
    setBeaconMicStatus("unknown");
    setBeaconSampleRate(null);
    setBeaconMeasurement(null);
    if (context !== null && context.state !== "closed") {
      void context.close();
    }
    setStatus("Local audio stopped.");
  }

  function exportEvidence() {
    const blob = new Blob([JSON.stringify({
      format: "herd-positioning-lab-distance",
      version: 2,
      exportedAt: new Date().toISOString(),
      sessionName,
      notes,
      profile,
      beaconSelfMeasurement: beaconMeasurement,
      labState,
    }, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${sessionName || "positioning-lab"}-distance-evidence.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div>
          <p className="eyebrow"><Radio size={16} /> Herd Lab</p>
          <input
            className="session-name"
            value={sessionName}
            onChange={(event) => setSessionName(event.target.value)}
            aria-label="Session name"
          />
        </div>
        <div className="header-actions">
          <button className="danger-button" onClick={stopAudio}><Square size={16} />Stop local audio</button>
          <button onClick={() => void enableBeaconMic()}><Mic size={16} />Arm beacon mic</button>
          <button onClick={() => void testSignal()}><Volume2 size={16} />Test signal</button>
          <button className="primary-button" onClick={() => void runDistanceScan()}><Play size={16} />Run distance scan</button>
          <button onClick={exportEvidence}><Download size={16} />Export</button>
        </div>
      </header>

      <section className="top-grid distance-top-grid">
        <section className="panel join-panel">
          <h2>Join Phone</h2>
          {qr.length > 0 && <img src={qr} alt="Positioning lab join QR code" />}
          <p>{joinUrl}</p>
          <StatusLine label="Server" value={serverBase} tone="ready" />
        </section>

        <ProfilePanel profile={profile} profileId={profileId} onProfile={setProfileId} />

        <section className="panel results-panel">
          <h2>Distance Result</h2>
          {labState?.latestScan === null || labState?.latestScan === undefined ? (
            <p className="muted">Join a phone, then run a distance scan.</p>
          ) : (
            <DistanceSummary scan={labState.latestScan} beaconMeasurement={beaconMeasurement} />
          )}
          {scanProgress !== null && <ScanProgress progress={scanProgress} />}
          {status !== null && <p className="server-status">{status}</p>}
        </section>
      </section>

      <section className="main-grid distance-main-grid">
        <section className="panel devices-panel">
          <div className="panel-title-row">
            <h2>Joined Phones</h2>
            <span>{labState?.devices.length ?? 0}</span>
          </div>
          <LiveDeviceTable devices={labState?.devices ?? []} />
        </section>

        <section className="panel measurements-panel">
          <h2>Measurements</h2>
          <LiveMeasurementTable scan={labState?.latestScan ?? null} beaconMeasurement={beaconMeasurement} />
        </section>
      </section>

      <section className="bottom-grid distance-bottom-grid">
        <section className="panel beacon-panel">
          <h2>Beacon Self-Recording</h2>
          <div className="metric-row">
            <Metric label="Mic" value={beaconMicStatus} />
            <Metric label="Sample rate" value={beaconSampleRate ?? "--"} />
            <Metric label="Clock RTT" value={controllerClock === null ? "--" : `${controllerClock.rttMs.toFixed(0)}ms`} />
            <Metric label="Latency" value={beaconMeasurement?.latencyMs === null || beaconMeasurement?.latencyMs === undefined ? "--" : `${beaconMeasurement.latencyMs.toFixed(1)}ms`} />
          </div>
          <p className="muted">Arm the controller microphone before scanning. The controller records its own emitted signal and subtracts that latency from phone arrivals.</p>
        </section>
        <section className="panel notes-panel">
          <h2>Operator Notes</h2>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Operator notes" />
        </section>
      </section>
    </main>
  );
}

function DeviceClient() {
  const params = new URLSearchParams(window.location.search);
  const sessionName = params.get("session") ?? "distance-test";
  const [label, setLabel] = useState(() => localStorage.getItem(deviceLabelKey) ?? "Phone");
  const [deviceId] = useState(() => getStoredDeviceId());
  const [labState, setLabState] = useState<LiveLabState | null>(null);
  const [status, setStatus] = useState("Client ready.");
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("locked");
  const [micStatus, setMicStatus] = useState<MicStatus>("unknown");
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [lastMeasurement, setLastMeasurement] = useState<LiveMeasurement | null>(null);
  const [clockSync, setClockSync] = useState<ClockSync | null>(null);
  const [joined, setJoined] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processedScans = useRef<Set<string>>(new Set());
  const serverClock = useRef<ClockSync | null>(null);
  const micSupported = typeof navigator.mediaDevices?.getUserMedia === "function";
  const canRequestMic = window.isSecureContext && micSupported;

  useEffect(() => {
    localStorage.setItem(deviceLabelKey, label);
  }, [label]);

  useEffect(() => {
    if (!window.isSecureContext) {
      setMicStatus("blocked");
      setStatus("Microphone requires HTTPS or localhost. This phone URL cannot request mic permission.");
      return;
    }

    if (!micSupported) {
      setMicStatus("blocked");
      setStatus("This browser does not expose microphone capture.");
      return;
    }

    setMicStatus("available");

    if (navigator.permissions?.query === undefined) return;
    void navigator.permissions.query({ name: "microphone" as PermissionName })
      .then((permission) => {
        setMicStatus(permission.state === "granted" ? "granted" : permission.state === "denied" ? "denied" : "prompt");
        permission.addEventListener("change", () => {
          setMicStatus(permission.state === "granted" ? "granted" : permission.state === "denied" ? "denied" : "prompt");
        });
      })
      .catch(() => {
        setMicStatus("available");
      });
  }, [micSupported]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    const context = audioRef.current;
    if (context !== null && context.state !== "closed") void context.close();
  }, []);

  async function join() {
    try {
      if (!window.isSecureContext) {
        setMicStatus("blocked");
        setStatus("Microphone is blocked on this URL. Use HTTPS, or open the client on localhost during development.");
        return;
      }

      if (!micSupported) {
        setMicStatus("blocked");
        setStatus("Microphone capture is unavailable in this browser.");
        return;
      }

      setStatus("Requesting microphone permission...");
      setMicStatus("prompt");
      const context = audioRef.current ?? createAudioContext();
      audioRef.current = context;
      await context.resume();
      setAudioStatus(context.state === "running" ? "ready" : "blocked");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      setMicStatus("granted");
      setSampleRate(context.sampleRate);
      const timedJoin = await postJsonWithTiming<{ serverTimeMs: number; session: LiveLabState }>(
        `/api/positioning-lab/${encodeURIComponent(sessionName)}/devices`,
        {
          deviceId,
          label,
          audio: "ready",
          mic: "granted",
          sampleRate: context.sampleRate,
        },
      );
      const joinClock = createClockSyncSample(timedJoin.body.serverTimeMs, timedJoin.sentAt, timedJoin.receivedAt);
      const clock = refineClockSync(joinClock, await syncServerClock(sessionName, 6));
      serverClock.current = clock;
      setClockSync(clock);
      setLabState(timedJoin.body.session);
      setJoined(true);
      setStatus(`Joined. Clock sync RTT ${clock.rttMs.toFixed(0)}ms. Waiting for a scheduled signal.`);
    } catch (error) {
      setMicStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "blocked");
      setAudioStatus(audioRef.current?.state === "running" ? "ready" : "blocked");
      setStatus(error instanceof Error ? error.message : "Could not join this phone.");
    }
  }

  useEffect(() => {
    if (!joined || streamRef.current === null || audioRef.current === null) return;
    let cancelled = false;

    async function poll() {
      try {
        const response = await postJsonWithTiming<{ serverTimeMs: number; session: LiveLabState }>(
          `/api/positioning-lab/${encodeURIComponent(sessionName)}/devices/${encodeURIComponent(deviceId)}/heartbeat`,
          {
            label,
            audio: audioRef.current?.state === "running" ? "ready" : "blocked",
            mic: streamRef.current?.active === true ? "granted" : "denied",
            sampleRate: audioRef.current?.sampleRate,
          },
        );
        const heartbeatClock = createClockSyncSample(response.body.serverTimeMs, response.sentAt, response.receivedAt);
        const nextClock = refineClockSync(serverClock.current, heartbeatClock);
        serverClock.current = nextClock;
        setClockSync(nextClock);
        if (cancelled) return;
        setLabState(response.body.session);
        const scan = response.body.session.latestScan;
        if (
          scan !== null &&
          scan.status !== "complete" &&
          !processedScans.current.has(scan.id) &&
          streamRef.current !== null &&
          audioRef.current !== null
        ) {
          processedScans.current.add(scan.id);
          void measureScan(sessionName, deviceId, label, scan, audioRef.current, streamRef.current, serverClock.current?.offsetMs ?? 0)
            .then((measurement) => {
              if (!cancelled) {
                setLastMeasurement(measurement);
                setStatus(measurement.detected ? "Signal detected." : "No signal detected.");
              }
            })
            .catch((error) => {
              if (!cancelled) setStatus(error instanceof Error ? error.message : "Scan failed.");
            });
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Unable to reach lab server.");
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), 700);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [deviceId, joined, label, sessionName]);

  return (
    <main className="device-shell">
      <section className="panel device-client-panel">
        <p className="eyebrow"><Smartphone size={16} /> Herd distance client</p>
        <h1>{sessionName}</h1>
        <div className="device-ready-banner">
          {joined ? <CheckCircle2 size={18} /> : <Activity size={18} />}
          <span>{joined ? "Phone joined" : "Phone client loaded"}</span>
        </div>
        {!window.isSecureContext && (
          <div className="device-warning">
            <AlertTriangle size={18} />
            <span>Mic capture is blocked on non-HTTPS network URLs.</span>
          </div>
        )}
        <label>
          Device label
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <button className="primary-button device-join-button" disabled={!canRequestMic} onClick={() => void join()}><Mic size={16} />Enable mic and join</button>
        <p className="server-status">{status}</p>
        <div className="metric-row">
          <Metric label="Page" value={window.isSecureContext ? "secure" : "blocked"} />
          <Metric label="Audio" value={audioStatus} />
          <Metric label="Mic" value={micStatus} />
          <Metric label="Sample rate" value={sampleRate ?? "--"} />
          <Metric label="Clock RTT" value={clockSync === null ? "--" : `${clockSync.rttMs.toFixed(0)}ms`} />
        </div>
        {lastMeasurement !== null && (
          <div className="distance-readout">
            <span>Raw arrival</span>
            <strong>{lastMeasurement.arrivalTimeMs === null ? "--" : `${lastMeasurement.arrivalTimeMs.toFixed(1)}ms`}</strong>
            <p>
              Confidence {lastMeasurement.confidence.toFixed(2)}
            </p>
          </div>
        )}
        {labState?.latestScan !== null && labState?.latestScan !== undefined && (
          <p className="muted">Latest scan: {labState.latestScan.status}</p>
        )}
      </section>
    </main>
  );
}

function ProfilePanel({
  profile,
  profileId,
  onProfile,
}: {
  profile: ChirpProfile;
  profileId: string;
  onProfile: (profileId: string) => void;
}) {
  return (
    <section className="panel profile-panel">
      <h2>Signal Profile</h2>
      <label>
        Preset
        <select value={profileId} onChange={(event) => onProfile(event.target.value)}>
          {chirpProfiles.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
        </select>
      </label>
      <div className="profile-grid">
        <Metric label="Band" value={profile.band} />
        <Metric label="Gain" value={profile.gain.toFixed(2)} />
        <Metric label="Duration" value={`${profile.durationMs}ms`} />
        <Metric label="Burst" value={profile.burstMs === undefined ? "--" : `${profile.burstMs}ms`} />
        <Metric label="Code" value={profile.code === undefined ? "chirp" : `${profile.code.length} chips`} />
        <Metric label="Repeats" value={profile.repeats} />
        <Metric label="Threshold" value={profile.threshold.toFixed(2)} />
      </div>
    </section>
  );
}

function DistanceSummary({ scan, beaconMeasurement }: { scan: LiveScan; beaconMeasurement: BeaconSelfMeasurement | null }) {
  const best = scan.measurements.find((measurement) => measurement.detected);
  const correctedDistance = best === undefined ? null : correctedDistanceMeters(best, beaconMeasurement);
  return (
    <>
      <div className="metric-row">
        <Metric label="Status" value={scan.status} />
        <Metric label="Phones" value={scan.measurements.length} />
        <Metric label="Raw arrival" value={best?.arrivalTimeMs === null || best?.arrivalTimeMs === undefined ? "--" : `${best.arrivalTimeMs.toFixed(1)}ms`} />
        <Metric label="Corrected distance" value={correctedDistance === null ? "--" : `${correctedDistance.toFixed(2)} m`} />
      </div>
      {(beaconMeasurement === null || beaconMeasurement.latencyMs === null) && best !== undefined && (
        <p className="warning"><AlertTriangle size={14} />Raw one-way arrival includes fixed browser/audio latency. Arm beacon mic before scanning to correct it.</p>
      )}
      {scan.measurements.length === 0 && <p className="muted">Waiting for phone measurement.</p>}
      {scan.status === "complete" && scan.measurements.every((measurement) => !measurement.detected) && (
        <p className="warning"><AlertTriangle size={14} />No device detected the signal.</p>
      )}
    </>
  );
}

function ScanProgress({ progress }: { progress: ReturnType<typeof getScanProgress> }) {
  return (
    <div className="scan-progress" style={{ "--progress": progress.percent } as CSSProperties}>
      <div className="progress-ring" aria-hidden="true">
        <span>{Math.round(progress.percent)}%</span>
      </div>
      <div>
        <strong>{progress.label}</strong>
        <p>{progress.remainingMs <= 0 ? "Finishing..." : `${formatSeconds(progress.remainingMs)} remaining`}</p>
      </div>
    </div>
  );
}

function LiveDeviceTable({ devices }: { devices: LiveLabDevice[] }) {
  if (devices.length === 0) {
    return <p className="muted">No phone joined yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Audio</th>
            <th>Mic</th>
            <th>Sample rate</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id}>
              <td>{device.label}</td>
              <td><StatusPill label={device.audio} /></td>
              <td><StatusPill label={device.mic} /></td>
              <td>{device.sampleRate ?? "--"}</td>
              <td>{Math.max(0, Math.round((Date.now() - device.lastSeenAt) / 1000))}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveMeasurementTable({ scan, beaconMeasurement }: { scan: LiveScan | null; beaconMeasurement: BeaconSelfMeasurement | null }) {
  if (scan === null) {
    return <p className="muted">Run a scan to collect measurements.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Phone</th>
            <th>Detected</th>
            <th>Corrected distance</th>
            <th>Raw arrival</th>
            <th>Beacon latency</th>
            <th>SNR</th>
            <th>Confidence</th>
            <th>Processing</th>
          </tr>
        </thead>
        <tbody>
          {scan.measurements.map((measurement) => (
            <tr key={measurement.deviceId}>
              <td>{measurement.label}</td>
              <td><StatusPill label={measurement.detected ? "yes" : "no"} /></td>
              <td>{formatCorrectedDistance(measurement, beaconMeasurement)}</td>
              <td>{measurement.arrivalTimeMs === null ? "--" : `${measurement.arrivalTimeMs.toFixed(1)}ms`}</td>
              <td>{beaconMeasurement?.latencyMs === null || beaconMeasurement?.latencyMs === undefined ? "--" : `${beaconMeasurement.latencyMs.toFixed(1)}ms`}</td>
              <td>{measurement.snr === null ? "--" : measurement.snr.toFixed(1)}</td>
              <td>{measurement.confidence.toFixed(2)}</td>
              <td>{measurement.processingMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function scheduleLeftSignal(context: AudioContext, profile: ChirpProfile, delayMs: number) {
  const signal = createSignalBuffer(context, profile, context.sampleRate);
  const startAt = context.currentTime + Math.max(0.05, delayMs / 1000);
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = signal;
  gain.gain.value = profile.gain;

  if ("StereoPannerNode" in window) {
    const panner = new StereoPannerNode(context, { pan: -1 });
    source.connect(gain).connect(panner).connect(context.destination);
  } else {
    source.connect(gain).connect(context.destination);
  }

  source.start(startAt);
}

async function measureScan(
  sessionName: string,
  deviceId: string,
  label: string,
  scan: LiveScan,
  context: AudioContext,
  stream: MediaStream,
  offsetMs: number,
): Promise<LiveMeasurement> {
  const leadMs = 360;
  const localServerNow = Date.now() + offsetMs;
  const captureDelayMs = Math.max(0, scan.startAt - localServerNow - leadMs);
  const startedAt = performance.now();
  const samples = await captureSamples(context, stream, captureDelayMs, scan.durationMs + leadMs + 900);
  const processingStarted = performance.now();
  const profile = chirpProfiles.find((candidate) => candidate.id === scan.profileId) ?? chirpProfiles[0]!;
  const reference = createPositioningSignalSamples(context.sampleRate, profile);
  const result = findPositioningSignal(samples, reference, context.sampleRate, leadMs);
  const processingMs = Math.round(performance.now() - processingStarted);
  const detected = result.confidence >= profile.threshold;
  const arrivalTimeMs = detected ? result.arrivalTimeMs : null;
  const measurement: LiveMeasurement = {
    deviceId,
    label,
    scanId: scan.id,
    detected,
    distanceMeters: null,
    arrivalTimeMs,
    confidence: result.confidence,
    snr: detected ? result.snr : null,
    peakWidthMs: detected ? result.peakWidthMs : null,
    processingMs: Math.max(processingMs, Math.round(performance.now() - startedAt - captureDelayMs - scan.durationMs)),
  };
  await postJson(`/api/positioning-lab/${encodeURIComponent(sessionName)}/scans/${encodeURIComponent(scan.id)}/measurements`, measurement);
  return measurement;
}

async function measureBeaconSelf(
  scan: LiveScan,
  context: AudioContext,
  stream: MediaStream,
  scheduleDelayMs: number,
): Promise<BeaconSelfMeasurement> {
  const leadMs = 360;
  const captureDelayMs = Math.max(0, scheduleDelayMs - leadMs);
  const startedAt = performance.now();
  const samples = await captureSamples(context, stream, captureDelayMs, scan.durationMs + leadMs + 900);
  const processingStarted = performance.now();
  const profile = chirpProfiles.find((candidate) => candidate.id === scan.profileId) ?? chirpProfiles[0]!;
  const reference = createPositioningSignalSamples(context.sampleRate, profile);
  const result = findPositioningSignal(samples, reference, context.sampleRate, leadMs);
  const processingMs = Math.round(performance.now() - processingStarted);
  const detected = result.confidence >= profile.threshold;
  return {
    scanId: scan.id,
    detected,
    latencyMs: detected ? result.arrivalTimeMs : null,
    confidence: result.confidence,
    snr: detected ? result.snr : null,
    processingMs: Math.max(processingMs, Math.round(performance.now() - startedAt - captureDelayMs - scan.durationMs)),
  };
}

function captureSamples(
  context: AudioContext,
  stream: MediaStream,
  delayMs: number,
  durationMs: number,
): Promise<Float32Array> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(2048, 1, 1);
      const sink = context.createGain();
      const chunks: Float32Array[] = [];
      sink.gain.value = 0;
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(sink).connect(context.destination);
      window.setTimeout(() => {
        source.disconnect();
        processor.disconnect();
        sink.disconnect();
        const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const samples = new Float32Array(total);
        let cursor = 0;
        for (const chunk of chunks) {
          samples.set(chunk, cursor);
          cursor += chunk.length;
        }
        resolve(samples);
      }, durationMs);
    }, delayMs);
  });
}

function createSignalBuffer(context: AudioContext, profile: ChirpProfile, sampleRate: number): AudioBuffer {
  const samples = createPositioningSignalSamples(sampleRate, profile);
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

function findPositioningSignal(samples: Float32Array, reference: Float32Array, sampleRate: number, leadMs: number) {
  const start = Math.max(0, Math.round((leadMs - 120) / 1000 * sampleRate));
  const end = Math.min(samples.length - reference.length, Math.round((leadMs + 900) / 1000 * sampleRate));
  let bestScore = 0;
  let bestIndex = start;
  const referenceEnergy = Math.sqrt(sumEnergy(reference, 4));

  for (let offset = start; offset < end; offset += 12) {
    let dot = 0;
    let energy = 0;
    for (let index = 0; index < reference.length; index += 4) {
      const sample = samples[offset + index] ?? 0;
      const ref = reference[index] ?? 0;
      dot += sample * ref;
      energy += sample * sample;
    }
    const score = Math.abs(dot) / Math.max(0.0001, Math.sqrt(energy) * referenceEnergy);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = offset;
    }
  }

  const arrivalTimeMs = (bestIndex / sampleRate) * 1000 - leadMs;
  return {
    arrivalTimeMs: Math.max(0, arrivalTimeMs),
    confidence: clamp(bestScore * 2.4, 0, 1),
    snr: clamp(bestScore * 32, 0, 48),
    peakWidthMs: clamp(24 - bestScore * 18, 3, 24),
  };
}

function sumEnergy(samples: Float32Array, stride: number): number {
  let energy = 0;
  for (let index = 0; index < samples.length; index += stride) {
    const sample = samples[index] ?? 0;
    energy += sample * sample;
  }
  return energy;
}

async function fetchLabState(sessionName: string): Promise<LiveLabState> {
  let response: Response;
  try {
    response = await fetch(`${serverBase}/api/positioning-lab/${encodeURIComponent(sessionName)}`);
  } catch (error) {
    throw new Error(formatNetworkError(error));
  }
  if (!response.ok) {
    throw new Error(`Lab server returned ${response.status}.`);
  }
  return response.json() as Promise<LiveLabState>;
}

async function syncServerClock(sessionName: string, attempts: number): Promise<ClockSync> {
  const samples: ClockSync[] = [];
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetchJsonWithTiming<{ serverTimeMs: number }>(
        `/api/positioning-lab/${encodeURIComponent(sessionName)}/clock`,
      );
      samples.push(createClockSyncSample(response.body.serverTimeMs, response.sentAt, response.receivedAt));
    } catch {
      // Keep trying; a single delayed or failed sample should not block the whole sync.
    }
    if (index < attempts - 1) {
      await sleep(35);
    }
  }

  if (samples.length === 0) {
    throw new Error("Could not sync clock with lab server.");
  }

  const best = [...samples].sort((left, right) => left.rttMs - right.rttMs).slice(0, Math.min(3, samples.length));
  const weighted = best.reduce((state, sample) => {
    const weight = 1 / Math.max(1, sample.rttMs);
    return {
      weight: state.weight + weight,
      offset: state.offset + sample.offsetMs * weight,
    };
  }, { weight: 0, offset: 0 });
  return {
    offsetMs: weighted.offset / weighted.weight,
    rttMs: best[0]?.rttMs ?? samples[0]!.rttMs,
    samples: samples.length,
    syncedAt: Date.now(),
  };
}

async function fetchJsonWithTiming<T>(path: string): Promise<TimedJson<T>> {
  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${serverBase}${path}`, { cache: "no-store" });
  } catch (error) {
    throw new Error(formatNetworkError(error));
  }
  const receivedAt = Date.now();
  if (!response.ok) {
    throw new Error(`Lab server returned ${response.status}: ${await response.text()}`);
  }
  return {
    body: await response.json() as T,
    sentAt,
    receivedAt,
    rttMs: receivedAt - sentAt,
  };
}

async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  return (await postJsonWithTiming<T>(path, body)).body;
}

async function postJsonWithTiming<T = unknown>(path: string, body: unknown): Promise<TimedJson<T>> {
  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${serverBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(formatNetworkError(error));
  }
  const receivedAt = Date.now();
  if (!response.ok) {
    throw new Error(`Lab server returned ${response.status}: ${await response.text()}`);
  }
  return {
    body: await response.json() as T,
    sentAt,
    receivedAt,
    rttMs: receivedAt - sentAt,
  };
}

function formatNetworkError(error: unknown): string {
  const detail = error instanceof Error ? error.message : "network request failed";
  return `Could not reach lab API at ${serverBase}. ${detail}. If Safari shows a certificate warning, install and fully trust the mkcert root CA, then reopen the current HTTPS QR URL.`;
}

function getStoredDeviceId(): string {
  const existing = localStorage.getItem(deviceIdKey);
  if (existing !== null) return existing;
  const created = createBrowserId("positioning-device");
  localStorage.setItem(deviceIdKey, created);
  return created;
}

function createAudioContext(): AudioContext {
  const AudioContextConstructor = window.AudioContext ?? (window as WebKitAudioWindow).webkitAudioContext;
  if (AudioContextConstructor === undefined) {
    throw new Error("Web Audio is unavailable in this browser.");
  }
  return new AudioContextConstructor();
}

function createBrowserId(prefix: string): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") {
    return `${prefix}-${randomUUID.call(globalThis.crypto)}`;
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return `${prefix}-${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function createClockSyncSample(serverTimeMs: number, sentAt: number, receivedAt: number): ClockSync {
  const midpoint = sentAt + (receivedAt - sentAt) / 2;
  return {
    offsetMs: serverTimeMs - midpoint,
    rttMs: receivedAt - sentAt,
    samples: 1,
    syncedAt: receivedAt,
  };
}

function refineClockSync(current: ClockSync | null, sample: ClockSync): ClockSync {
  if (current === null) return sample;
  if (sample.rttMs < current.rttMs || Date.now() - current.syncedAt > 10_000) {
    return {
      ...sample,
      samples: current.samples + sample.samples,
    };
  }
  return {
    ...current,
    samples: current.samples + sample.samples,
  };
}

function estimateServerNow(clock: ClockSync): number {
  return Date.now() + clock.offsetMs;
}

function correctedDistanceMeters(measurement: LiveMeasurement, beaconMeasurement: BeaconSelfMeasurement | null): number | null {
  if (
    beaconMeasurement === null ||
    beaconMeasurement.latencyMs === null ||
    measurement.arrivalTimeMs === null ||
    !measurement.detected
  ) {
    return null;
  }
  return Math.max(0, (measurement.arrivalTimeMs - beaconMeasurement.latencyMs) * speedOfSoundMetersPerMs);
}

function formatCorrectedDistance(measurement: LiveMeasurement, beaconMeasurement: BeaconSelfMeasurement | null): string {
  const distance = correctedDistanceMeters(measurement, beaconMeasurement);
  return distance === null ? "--" : `${distance.toFixed(2)} m`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function buildDeviceJoinUrl(originOrBase: string, sessionName: string): string {
  const base = normalizeOrigin(originOrBase);
  const labBase = base.endsWith(positioningLabBasePath) ? base : `${base}${positioningLabBasePath}`;
  return `${labBase}/positioning-device?session=${encodeURIComponent(sessionName)}`;
}

function getScanProgress(scan: LiveScan, now: number): { percent: number; remainingMs: number; label: string } {
  const startAt = scan.startAt;
  const endAt = scan.startAt + scan.durationMs + 900;
  if (scan.status === "complete") {
    return { percent: 100, remainingMs: 0, label: "Complete" };
  }
  if (scan.status === "stopped") {
    return { percent: 100, remainingMs: 0, label: "Stopped" };
  }
  if (now < startAt) {
    const leadMs = Math.max(1, startAt - scan.createdAt);
    const elapsed = Math.max(0, now - scan.createdAt);
    return {
      percent: Math.min(34, (elapsed / leadMs) * 34),
      remainingMs: startAt - now,
      label: "Waiting for signal",
    };
  }
  return {
    percent: Math.min(99, 34 + ((now - startAt) / Math.max(1, endAt - startAt)) * 65),
    remainingMs: Math.max(0, endAt - now),
    label: scan.status === "running" ? "Listening for phone measurements" : "Processing scan",
  };
}

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 100) / 10).toFixed(1)}s`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone: "ready" | "warning" }) {
  return (
    <div className="status-line">
      <span>{label}</span>
      <StatusPill label={value} tone={tone} />
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone?: "ready" | "warning" | "blocked" }) {
  const resolvedTone = tone ?? (label === "ready" || label === "yes" || label === "granted" ? "ready" : label === "blocked" || label === "no" || label === "denied" ? "blocked" : "warning");
  return <span className={`status-pill ${resolvedTone}`}><Activity size={12} />{label}</span>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
