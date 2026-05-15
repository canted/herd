import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Activity,
  AlertTriangle,
  Download,
  MapPinned,
  Play,
  Plus,
  Radio,
  Square,
  Trash2,
} from "lucide-react";
import {
  chirpProfiles,
  createDefaultDevices,
  createDevice,
  createLabExport,
  runSimulatedScan,
  summarizeScan,
  type ChirpProfile,
  type DeviceRole,
  type LabDevice,
  type LayoutPoint,
  type ScanResult,
} from "./model";

const roles: DeviceRole[] = ["beacon", "listener", "backupBeacon", "observer"];
const configuredJoinOrigin = import.meta.env.VITE_POSITIONING_LAB_PUBLIC_ORIGIN as string | undefined;

export function App() {
  const [sessionName, setSessionName] = useState("north-gallery-test");
  const [devices, setDevices] = useState<LabDevice[]>(createDefaultDevices);
  const [profileId, setProfileId] = useState("audible-robust");
  const [latestScan, setLatestScan] = useState<ScanResult | null>(null);
  const [notes, setNotes] = useState("");
  const [qr, setQr] = useState("");
  const profile = chirpProfiles.find((candidate) => candidate.id === profileId) ?? chirpProfiles[1]!;
  const joinOrigin = normalizeOrigin(configuredJoinOrigin ?? window.location.origin);
  const joinUrl = `${joinOrigin}/positioning-device?session=${encodeURIComponent(sessionName)}`;
  const summary = latestScan === null ? null : summarizeScan(latestScan);

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

  function updateDevice(deviceId: string, patch: Partial<LabDevice>) {
    setDevices((current) => current.map((device) => device.id === deviceId ? { ...device, ...patch } : device));
  }

  function runScan() {
    setLatestScan(runSimulatedScan(devices, profile));
  }

  function addDevice() {
    setDevices((current) => [
      ...current,
      createDevice(`device ${current.length + 1}`, "listener", 0.45 + current.length * 0.05, 0.5),
    ]);
  }

  function exportEvidence() {
    const blob = new Blob([JSON.stringify(createLabExport(sessionName, devices, latestScan, notes), null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${sessionName || "positioning-lab"}-evidence.json`;
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
          <button className="danger-button" onClick={() => setLatestScan(null)}><Square size={16} />Stop all audio</button>
          <button className="primary-button" onClick={runScan}><Play size={16} />Run scan</button>
          <button onClick={exportEvidence}><Download size={16} />Export</button>
        </div>
      </header>

      <section className="top-grid">
        <section className="panel join-panel">
          <h2>Join Devices</h2>
          {qr.length > 0 && <img src={qr} alt="Positioning lab join QR code" />}
          <p>{joinUrl}</p>
          <StatusLine label="HTTPS" value={window.location.protocol === "https:" ? "ready" : "local only"} tone={window.location.protocol === "https:" ? "ready" : "warning"} />
        </section>

        <ProfilePanel profile={profile} profileId={profileId} onProfile={setProfileId} />

        <section className="panel results-panel">
          <h2>Latest Scan</h2>
          {summary === null ? (
            <p className="muted">No scan run yet.</p>
          ) : (
            <>
              <div className="metric-row">
                <Metric label="Detected" value={summary.detected} />
                <Metric label="Missed" value={summary.missed} />
                <Metric label="Confidence" value={summary.averageConfidence.toFixed(2)} />
              </div>
              {latestScan?.warnings.map((warning) => (
                <p key={warning} className="warning"><AlertTriangle size={14} />{warning}</p>
              ))}
            </>
          )}
        </section>
      </section>

      <section className="main-grid">
        <section className="panel devices-panel">
          <div className="panel-title-row">
            <h2>Devices</h2>
            <button onClick={addDevice}><Plus size={14} />Add</button>
          </div>
          <DeviceTable devices={devices} onUpdate={updateDevice} onDelete={(deviceId) => setDevices((current) => current.filter((device) => device.id !== deviceId))} />
        </section>

        <section className="panel layout-panel">
          <div className="panel-title-row">
            <h2>Relative Layout</h2>
            <span>approximate</span>
          </div>
          <LayoutPreview devices={devices} layout={latestScan?.layout ?? []} />
        </section>
      </section>

      <section className="bottom-grid">
        <section className="panel measurements-panel">
          <h2>Measurements</h2>
          <MeasurementTable result={latestScan} devices={devices} />
        </section>

        <section className="panel notes-panel">
          <h2>Operator Notes</h2>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Operator notes" />
        </section>
      </section>
    </main>
  );
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
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
      <h2>Chirp Profile</h2>
      <label>
        Preset
        <select value={profileId} onChange={(event) => onProfile(event.target.value)}>
          {chirpProfiles.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
        </select>
      </label>
      <div className="profile-grid">
        <Metric label="Band" value={profile.band} />
        <Metric label="Gain" value={profile.gain.toFixed(2)} />
        <Metric label="Slot" value={`${profile.slotMs}ms`} />
        <Metric label="Guard" value={`${profile.guardMs}ms`} />
        <Metric label="Repeats" value={profile.repeats} />
        <Metric label="Threshold" value={profile.threshold.toFixed(2)} />
      </div>
    </section>
  );
}

function DeviceTable({
  devices,
  onUpdate,
  onDelete,
}: {
  devices: LabDevice[];
  onUpdate: (deviceId: string, patch: Partial<LabDevice>) => void;
  onDelete: (deviceId: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Role</th>
            <th>Audio</th>
            <th>Mic</th>
            <th>Sync</th>
            <th>Sample rate</th>
            <th>X</th>
            <th>Y</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id}>
              <td><input value={device.label} onChange={(event) => onUpdate(device.id, { label: event.target.value })} aria-label={`${device.label} label`} /></td>
              <td>
                <select value={device.role} onChange={(event) => onUpdate(device.id, { role: event.target.value as DeviceRole })}>
                  {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </td>
              <td><StatusPill label={device.audio} /></td>
              <td><span>{device.mic}</span></td>
              <td><StatusPill label={device.sync} /></td>
              <td>{device.sampleRate}</td>
              <td><input type="number" min="0" max="1" step="0.01" value={device.x} onChange={(event) => onUpdate(device.id, { x: Number(event.target.value) })} /></td>
              <td><input type="number" min="0" max="1" step="0.01" value={device.y} onChange={(event) => onUpdate(device.id, { y: Number(event.target.value) })} /></td>
              <td><button onClick={() => onDelete(device.id)}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LayoutPreview({ devices, layout }: { devices: LabDevice[]; layout: LayoutPoint[] }) {
  const byId = new Map(layout.map((point) => [point.deviceId, point]));
  return (
    <div className="layout-canvas">
      <MapPinned className="layout-icon" size={22} />
      {devices.map((device) => {
        const point = byId.get(device.id);
        const state = point?.state ?? "unlocated";
        return (
          <div
            key={device.id}
            className={`layout-point ${state}`}
            style={{ left: `${device.x * 100}%`, top: `${device.y * 100}%` }}
            title={`${device.label}: ${state}`}
          >
            <span>{device.label.slice(0, 2).toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}

function MeasurementTable({ result, devices }: { result: ScanResult | null; devices: LabDevice[] }) {
  const labels = useMemo(() => new Map(devices.map((device) => [device.id, device.label])), [devices]);

  if (result === null) {
    return <p className="muted">Run a scan to collect measurements.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Listener</th>
            <th>Beacon</th>
            <th>Detected</th>
            <th>SNR</th>
            <th>Confidence</th>
            <th>Peak</th>
            <th>Processing</th>
          </tr>
        </thead>
        <tbody>
          {result.measurements.map((measurement) => (
            <tr key={`${measurement.listenerDeviceId}:${measurement.beaconDeviceId}`}>
              <td>{labels.get(measurement.listenerDeviceId) ?? measurement.listenerDeviceId}</td>
              <td>{labels.get(measurement.beaconDeviceId) ?? measurement.beaconDeviceId}</td>
              <td><StatusPill label={measurement.detected ? "yes" : "no"} /></td>
              <td>{measurement.snr ?? "--"}</td>
              <td>{measurement.confidence.toFixed(2)}</td>
              <td>{measurement.peakWidthMs === null ? "--" : `${measurement.peakWidthMs}ms`}</td>
              <td>{measurement.processingMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  const resolvedTone = tone ?? (label === "ready" || label === "yes" ? "ready" : label === "blocked" || label === "no" ? "blocked" : "warning");
  return <span className={`status-pill ${resolvedTone}`}><Activity size={12} />{label}</span>;
}
