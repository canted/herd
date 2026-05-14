import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Link,
  Play,
  Radio,
  RotateCcw,
  Square,
  Smartphone,
  Users,
} from "lucide-react";
import QRCode from "qrcode";
import type {
  CreateSessionResponse,
  EventLogEntry,
  ParticipantSnapshot,
  ServerToClientMessage,
  SessionSnapshot,
} from "@herd/protocol";

const serverBase = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8787";
const participantBase = import.meta.env.VITE_PARTICIPANT_URL ?? "http://localhost:5174";

type ConnectionState = "idle" | "connecting" | "connected" | "offline" | "error";

export function App() {
  const initialCode = new URLSearchParams(window.location.search).get("code") ?? "";
  const [sessionName, setSessionName] = useState("Herd rehearsal");
  const [sessionCode, setSessionCode] = useState(initialCode);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);

  const joinUrl = useMemo(() => {
    if (sessionCode.length === 0) return "";
    return `${participantBase}/?code=${encodeURIComponent(sessionCode)}`;
  }, [sessionCode]);

  useEffect(() => {
    if (joinUrl.length === 0) return;
    void QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 260,
      color: {
        dark: "#121212",
        light: "#ffffff",
      },
    }).then(setQrDataUrl);
  }, [joinUrl]);

  useEffect(() => {
    if (sessionCode.length === 0) return;
    connectHost(sessionCode);
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessionCode]);

  async function createSession() {
    setError(null);
    const response = await fetch(`${serverBase}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sessionName }),
    });

    if (!response.ok) {
      setError(`Could not create session: ${response.status}`);
      return;
    }

    const payload = (await response.json()) as CreateSessionResponse;
    setSnapshot(payload.snapshot);
    setSessionCode(payload.snapshot.code);
    window.history.replaceState(null, "", `?code=${payload.snapshot.code}`);
  }

  function connectHost(code: string) {
    wsRef.current?.close();
    setConnectionState("connecting");
    const socket = new WebSocket(`${toWsBase(serverBase)}/ws?role=host&code=${encodeURIComponent(code)}`);
    wsRef.current = socket;

    socket.addEventListener("open", () => {
      if (wsRef.current !== socket) return;
      setConnectionState("connected");
      setError(null);
    });
    socket.addEventListener("close", () => {
      if (wsRef.current !== socket) return;
      setConnectionState("offline");
    });
    socket.addEventListener("error", () => {
      if (wsRef.current !== socket) return;
      setConnectionState("error");
      setError("Host socket failed.");
    });
    socket.addEventListener("message", (event) => {
      if (wsRef.current !== socket) return;
      const message = JSON.parse(event.data as string) as ServerToClientMessage;
      if (message.type === "snapshot") {
        setSnapshot(message.snapshot);
      }
      if (message.type === "error") {
        setError(message.message);
      }
    });
  }

  function send(message: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }

  if (snapshot === null) {
    return (
      <main className="setup-shell">
        <section className="setup-panel" aria-labelledby="setup-title">
          <div className="brand-row">
            <Radio aria-hidden="true" />
            <span>Herd Host</span>
          </div>
          <h1 id="setup-title">Create a rehearsal session</h1>
          <p>
            Open a local lobby, show a QR code, watch readiness, and start the fixture on
            connected phones.
          </p>
          <label>
            Session name
            <input
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
              placeholder="Venue rehearsal"
            />
          </label>
          <button className="primary-action" onClick={createSession}>
            <Play size={18} aria-hidden="true" />
            Open lobby
          </button>
          {sessionCode.length > 0 && (
            <button className="secondary-action" onClick={() => connectHost(sessionCode)}>
              Reconnect to {sessionCode}
            </button>
          )}
          {error !== null && <p className="error-copy">{error}</p>}
        </section>
      </main>
    );
  }

  const readiness = snapshot.readiness;

  return (
    <main className="host-shell">
      <header className="host-header">
        <div>
          <div className="brand-row compact">
            <Radio aria-hidden="true" />
            <span>Herd Host</span>
          </div>
          <h1>{snapshot.name}</h1>
        </div>
        <div className="header-status">
          <StatusPill label={snapshot.phase} tone={snapshot.phase === "live" ? "ready" : "neutral"} />
          <StatusPill label={connectionState} tone={connectionState === "connected" ? "ready" : "blocked"} />
          <span className="session-code">{snapshot.code}</span>
        </div>
      </header>

      <section className={`readiness-band ${readiness.status}`}>
        <div>
          <span className="eyeless-label">Readiness</span>
          <h2>{readiness.status}</h2>
          <p>{readiness.recommendedAction}</p>
        </div>
        <div className="readiness-counts" aria-label="Readiness counts">
          <Metric label="Ready" value={readiness.readyCount} />
          <Metric label="Degraded" value={readiness.degradedCount} />
          <Metric label="Blocked" value={readiness.blockedCount} />
          <Metric label="Connected" value={readiness.connectedCount} />
        </div>
      </section>

      <section className="host-grid">
        <div className="panel lobby-panel">
          <div className="panel-title">
            <Link size={18} aria-hidden="true" />
            <h2>Lobby</h2>
          </div>
          {qrDataUrl.length > 0 && <img className="qr" src={qrDataUrl} alt={`Join QR for session ${snapshot.code}`} />}
          <div className="join-url">{joinUrl}</div>
          <button className="secondary-action" onClick={() => void navigator.clipboard.writeText(joinUrl)}>
            Copy join link
          </button>
        </div>

        <div className="panel control-panel">
          <div className="panel-title">
            <Play size={18} aria-hidden="true" />
            <h2>Transport</h2>
          </div>
          <div className="transport-actions">
            <button className="primary-action" onClick={() => send({ type: "hostStart", leadTimeMs: 3000 })}>
              <Play size={18} aria-hidden="true" />
              Start
            </button>
            <button className="danger-action" onClick={() => send({ type: "hostStop" })}>
              <Square size={18} aria-hidden="true" />
              Stop
            </button>
            <button className="secondary-action" onClick={() => send({ type: "hostForceHolding" })}>
              <RotateCcw size={18} aria-hidden="true" />
              Force holding
            </button>
          </div>
          <dl className="transport-meta">
            <div>
              <dt>Fixture</dt>
              <dd>{snapshot.fixtureId}</dd>
            </div>
            <div>
              <dt>Start time</dt>
              <dd>{snapshot.transportStartTimeMs === undefined ? "Not scheduled" : formatTime(snapshot.transportStartTimeMs)}</dd>
            </div>
          </dl>
        </div>

        <div className="panel blockers-panel">
          <div className="panel-title">
            <AlertTriangle size={18} aria-hidden="true" />
            <h2>Blockers and impact</h2>
          </div>
          <ListItems items={readiness.topBlockers.length > 0 ? readiness.topBlockers : ["No top blockers."]} />
          <h3>Audience impact</h3>
          <ListItems items={readiness.audienceImpact} />
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-title">
          <Users size={18} aria-hidden="true" />
          <h2>Participants</h2>
        </div>
        <ParticipantTable participants={snapshot.participants} />
      </section>

      <section className="host-grid lower">
        <div className="panel">
          <div className="panel-title">
            <Smartphone size={18} aria-hidden="true" />
            <h2>Choice counts</h2>
          </div>
          {snapshot.choices.length === 0 ? (
            <p className="muted">No choices submitted yet.</p>
          ) : (
            <div className="choice-list">
              {snapshot.choices.map((choice) => (
                <div key={`${choice.promptId}:${choice.choiceId}`} className="choice-row">
                  <span>{choice.choiceId}</span>
                  <strong>{choice.count}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="panel log-panel">
          <div className="panel-title">
            <Radio size={18} aria-hidden="true" />
            <h2>Event log</h2>
          </div>
          <EventLog entries={snapshot.logs} />
        </div>
      </section>

      {error !== null && <div className="toast">{error}</div>}
    </main>
  );
}

function ParticipantTable({ participants }: { participants: ParticipantSnapshot[] }) {
  if (participants.length === 0) {
    return <p className="muted">No phones have joined yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Device</th>
            <th>Connection</th>
            <th>Audio</th>
            <th>Assets</th>
            <th>Clock</th>
            <th>Program</th>
            <th>Visibility</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={participant.id}>
              <td>{participant.label}</td>
              <td><StatusPill label={participant.connection} tone={participant.connection === "connected" ? "ready" : "blocked"} /></td>
              <td><StatusPill label={participant.audio} tone={participant.audio === "unlocked" ? "ready" : "blocked"} /></td>
              <td><StatusPill label={participant.assetStatus} tone={participant.assetStatus === "loaded" ? "ready" : participant.assetStatus === "failed" ? "blocked" : "neutral"} /></td>
              <td>{participant.clock === null ? "Pending" : `${Math.round(participant.clock.rttMs)}ms / ${Math.round(participant.clock.jitterMs)}ms jitter`}</td>
              <td>{participant.programId ?? "Holding"}</td>
              <td>{participant.visibility}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventLog({ entries }: { entries: EventLogEntry[] }) {
  return (
    <ol className="event-log">
      {[...entries].reverse().map((entry) => (
        <li key={entry.id}>
          <time>{formatTime(entry.at)}</time>
          <span className={`log-dot ${entry.level}`} aria-hidden="true" />
          <span>{entry.message}</span>
        </li>
      ))}
    </ol>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "ready" | "blocked" | "neutral" }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function ListItems({ items }: { items: string[] }) {
  return (
    <ul className="plain-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function toWsBase(httpBase: string): string {
  return httpBase.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
