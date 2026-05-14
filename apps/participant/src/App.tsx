import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ChoicePrompt, Composition, ParameterBag } from "@herd/composition";
import type {
  ClockQuality,
  ParticipantReport,
  ServerToClientMessage,
  SessionSnapshot,
} from "@herd/protocol";
import {
  buildCompositionTimeline,
  skipStaleEvents,
  type RuntimeTimelineEvent,
} from "@herd/runtime";
import {
  getRequiredSamplerAssetIds,
  loadEmbeddedAudioAssets,
  playSamplerEvent,
  playSynthEvent,
} from "./audio";

const serverBase = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8787";

type ParticipantPhase = "entry" | "connecting" | "holding" | "live" | "ended" | "recovery" | "error";

interface VisualState {
  hue: number;
  saturation: number;
  brightness: number;
  shape: string;
  pulse: number;
}

const defaultVisual: VisualState = {
  hue: 140,
  saturation: 0.55,
  brightness: 0.32,
  shape: "wash",
  pulse: 0,
};

export function App() {
  const initialCode = new URLSearchParams(window.location.search).get("code") ?? "";
  const [sessionCode, setSessionCode] = useState(initialCode.toUpperCase());
  const [phase, setPhase] = useState<ParticipantPhase>(initialCode.length === 0 ? "entry" : "entry");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [composition, setComposition] = useState<Composition | null>(null);
  const [audioStatus, setAudioStatus] = useState<ParticipantReport["audio"]>("locked");
  const [assetStatus, setAssetStatus] = useState<ParticipantReport["assetStatus"]>("unknown");
  const [clock, setClock] = useState<ClockQuality | null>(null);
  const [visual, setVisual] = useState<VisualState>(defaultVisual);
  const [activePrompt, setActivePrompt] = useState<ChoicePrompt | null>(null);
  const [choiceAck, setChoiceAck] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const audioAssetsRef = useRef<Map<string, AudioBuffer>>(new Map());
  const clockRef = useRef<ClockQuality | null>(null);
  const compositionRef = useRef<Composition | null>(null);
  const participantId = useMemo(getParticipantId, []);
  const clockSamples = useRef<number[]>([]);
  const timeouts = useRef<number[]>([]);

  const report = useMemo<ParticipantReport>(() => {
    const visibility = document.visibilityState === "hidden" ? "hidden" : "visible";
    const capability: ParticipantReport["capability"] = {
      webAudio: typeof AudioContext !== "undefined",
      audioWorklet: audioRef.current?.audioWorklet !== undefined,
      wasm: typeof WebAssembly !== "undefined",
      degradedReasons:
        visibility === "hidden" ? ["Page is hidden"] : [],
    };
    const programId = inferProgram(snapshot);

    if (audioRef.current?.sampleRate !== undefined) {
      capability.sampleRate = audioRef.current.sampleRate;
    }

    const nextReport: ParticipantReport = {
      audio: audioStatus,
      assetStatus,
      visibility,
      clock,
      capability,
      voiceId: "voice-green",
    };

    if (programId !== undefined) {
      nextReport.programId = programId;
    }

    return nextReport;
  }, [audioStatus, assetStatus, clock, snapshot]);

  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  useEffect(() => {
    compositionRef.current = composition;
  }, [composition]);

  useEffect(() => {
    send({ type: "participantReport", report });
  }, [report]);

  useEffect(() => {
    const onVisibility = () => {
      send({ type: "participantReport", report: { ...report, visibility: document.visibilityState === "hidden" ? "hidden" : "visible" } });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [report]);

  useEffect(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const interval = window.setInterval(() => {
      send({
        type: "clockPing",
        id: crypto.randomUUID(),
        clientSentAt: Date.now(),
      });
    }, 1200);

    return () => window.clearInterval(interval);
  }, [phase]);

  async function begin() {
    if (sessionCode.trim().length === 0) {
      setError("Enter the session code from the room sign.");
      return;
    }

    setError(null);
    setPhase("connecting");

    try {
      const context = new AudioContext();
      await context.resume();
      audioRef.current = context;
      setAudioStatus("unlocked");
    } catch {
      setAudioStatus("failed");
      setPhase("recovery");
      setError("Audio could not start on this device.");
      return;
    }

    connectParticipant(sessionCode.trim().toUpperCase());
  }

  async function resumeAudio() {
    try {
      await audioRef.current?.resume();
      setAudioStatus(audioRef.current?.state === "running" ? "unlocked" : "locked");
      setPhase(snapshot?.phase === "live" ? "live" : "holding");
    } catch {
      setAudioStatus("failed");
    }
  }

  function connectParticipant(code: string) {
    wsRef.current?.close();
    const socket = new WebSocket(
      `${toWsBase(serverBase)}/ws?role=participant&code=${encodeURIComponent(code)}&participantId=${participantId}`,
    );
    wsRef.current = socket;

    socket.addEventListener("open", () => {
      setPhase("holding");
      send({
        type: "clockPing",
        id: crypto.randomUUID(),
        clientSentAt: Date.now(),
      });
    });
    socket.addEventListener("close", () => setPhase("recovery"));
    socket.addEventListener("error", () => {
      setPhase("error");
      setError("Connection failed.");
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as ServerToClientMessage;
      handleServerMessage(message);
    });
  }

  function handleServerMessage(message: ServerToClientMessage) {
    switch (message.type) {
      case "fixture": {
        void loadSessionAssets(message.composition);
        return;
      }
      case "snapshot": {
        setSnapshot(message.snapshot);
        if (message.snapshot.phase === "ended") setPhase("ended");
        if (message.snapshot.phase === "holding") setPhase("holding");
        return;
      }
      case "clockPong": {
        const receivedAt = Date.now();
        const serverMidpoint = (message.serverReceivedAt + message.serverSentAt) / 2;
        const clientMidpoint = (message.clientSentAt + receivedAt) / 2;
        const rttMs = Math.max(0, receivedAt - message.clientSentAt - (message.serverSentAt - message.serverReceivedAt));
        const samples = [...clockSamples.current, rttMs].slice(-6);
        clockSamples.current = samples;
        const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
        const jitterMs = samples.reduce((max, sample) => Math.max(max, Math.abs(sample - average)), 0);
        const confidence = Math.max(0.05, Math.min(0.99, 1 - rttMs / 500 - jitterMs / 180));
        setClock({
          offsetMs: serverMidpoint - clientMidpoint,
          rttMs,
          jitterMs,
          confidence,
          lastSyncAt: receivedAt,
        });
        return;
      }
      case "prepareStart": {
        return;
      }
      case "startConfirmed": {
        if (compositionRef.current !== null) {
          scheduleComposition(compositionRef.current, message.transportStartTimeMs);
        }
        setPhase("live");
        return;
      }
      case "holdingForced": {
        clearScheduledEvents();
        setActivePrompt(null);
        setPhase("holding");
        return;
      }
      case "stopped": {
        clearScheduledEvents();
        setActivePrompt(null);
        setPhase("ended");
        return;
      }
      case "error": {
        setError(message.message);
        setPhase("error");
        return;
      }
    }
  }

  async function loadSessionAssets(nextComposition: Composition) {
    setComposition(nextComposition);
    setAssetStatus("unknown");

    const context = audioRef.current;
    if (context === null) {
      setAssetStatus("failed");
      return;
    }

    try {
      const buffers = await loadEmbeddedAudioAssets(context, nextComposition);
      const missingSamplerAssets = getRequiredSamplerAssetIds(nextComposition)
        .filter((assetId) => !buffers.has(assetId));
      audioAssetsRef.current = buffers;
      setAssetStatus(missingSamplerAssets.length === 0 ? "loaded" : "failed");
    } catch {
      audioAssetsRef.current = new Map();
      setAssetStatus("failed");
    }
  }

  function scheduleComposition(nextComposition: Composition, transportStartTimeMs: number) {
    clearScheduledEvents();
    const context = audioRef.current;
    if (context === null) {
      setPhase("recovery");
      return;
    }

    const timeline = buildCompositionTimeline(nextComposition);
    const serverNowMs = Date.now() + (clockRef.current?.offsetMs ?? 0);
    const transportPositionMs = Math.max(0, serverNowMs - transportStartTimeMs);
    const upcoming = skipStaleEvents(timeline.events, transportPositionMs, 60);

    for (const event of upcoming) {
      const eventServerTimeMs = transportStartTimeMs + event.timeMs;
      const delayMs = eventServerTimeMs - serverNowMs;
      const audioWhen = context.currentTime + Math.max(delayMs, 0) / 1000;

      if (event.type === "instrument") {
        if (event.instrumentType === "sampler") {
          playSamplerEvent(context, audioWhen, event.parameters, event.durationMs, audioAssetsRef.current);
        } else {
          playSynthEvent(context, audioWhen, event.parameters, event.durationMs);
        }
      }

      if (event.type === "visualizer") {
        scheduleTimeout(delayMs, () => triggerVisualizer(event.parameters));
      }

      if (event.type === "uiPrompt") {
        scheduleTimeout(delayMs, () => {
          setActivePrompt(event.prompt);
          setChoiceAck(null);
        });
      }
    }
  }

  function triggerVisualizer(parameters: ParameterBag) {
    setVisual((current) => ({
      hue: readNumber(parameters.hue, current.hue),
      saturation: readNumber(parameters.saturation, current.saturation),
      brightness: readNumber(parameters.brightness, current.brightness),
      shape: readString(parameters.shape, current.shape),
      pulse: current.pulse + 1,
    }));
  }

  function choose(promptId: string, choiceId: string) {
    send({ type: "participantChoice", promptId, choiceId });
    setChoiceAck("Choice received");
    window.setTimeout(() => setActivePrompt(null), 900);
  }

  function send(message: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }

  function scheduleTimeout(delayMs: number, callback: () => void) {
    const id = window.setTimeout(callback, Math.max(0, delayMs));
    timeouts.current.push(id);
  }

  function clearScheduledEvents() {
    for (const id of timeouts.current) {
      window.clearTimeout(id);
    }
    timeouts.current = [];
  }

  const visualStyle = {
    "--hue": `${visual.hue}`,
    "--saturation": `${Math.round(visual.saturation * 100)}%`,
    "--brightness": `${Math.round(visual.brightness * 100)}%`,
  } as CSSProperties;

  if (phase === "entry" || phase === "connecting") {
    return (
      <main className="entry-screen">
        <section className="entry-panel">
          <p className="session-label">Herd</p>
          <h1>{snapshot?.name ?? "Join the room"}</h1>
          <p>
            Your phone becomes part of the room's sound and light. Keep this page open during
            the piece.
          </p>
          <label>
            Session code
            <input value={sessionCode} onChange={(event) => setSessionCode(event.target.value.toUpperCase())} />
          </label>
          <button className="begin-button" onClick={() => void begin()} disabled={phase === "connecting"}>
            {phase === "connecting" ? "Joining..." : "Begin"}
          </button>
          <details>
            <summary>Privacy and device details</summary>
            <p>
              This rehearsal uses sound, screen visuals, and anonymous connection status. Close
              the page to leave.
            </p>
          </details>
          {error !== null && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (phase === "recovery" || phase === "error") {
    return (
      <main className="entry-screen recovery">
        <section className="entry-panel">
          <p className="session-label">Recovery</p>
          <h1>Reconnect the phone</h1>
          <p>{error ?? "The connection or audio context needs attention."}</p>
          <button className="begin-button" onClick={() => void resumeAudio()}>Resume audio</button>
          <button className="secondary-button" onClick={() => connectParticipant(sessionCode)}>Reconnect</button>
        </section>
      </main>
    );
  }

  if (phase === "ended") {
    return (
      <main className="entry-screen ended">
        <section className="entry-panel">
          <p className="session-label">Ended</p>
          <h1>Thank you</h1>
          <p>You can close this page.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={`live-screen ${phase}`} style={visualStyle}>
      <div className={`visual-core ${visual.shape}`} key={visual.pulse} aria-hidden="true" />
      <section className="status-strip" aria-live="polite">
        <span>{phase === "live" ? "Live" : "Holding"}</span>
        <span>Audio {audioStatus}</span>
        <span>{clock === null ? "Sync pending" : `${Math.round(clock.rttMs)}ms sync`}</span>
      </section>
      {phase === "holding" && (
        <section className="holding-copy">
          <p>{snapshot?.name ?? "Herd rehearsal"}</p>
          <h1>Ready</h1>
        </section>
      )}
      {activePrompt !== null && (
        <section className="prompt-panel" aria-labelledby="active-prompt">
          <h1 id="active-prompt">{activePrompt.text}</h1>
          <div className="choice-grid">
            {activePrompt.choices.map((choice) => (
              <button key={choice.id} onClick={() => choose(activePrompt.id, choice.id)}>
                {choice.label}
              </button>
            ))}
          </div>
          {choiceAck !== null && <p aria-live="polite">{choiceAck}</p>}
        </section>
      )}
    </main>
  );
}

function getParticipantId(): string {
  const key = "herd.participantId";
  const existing = localStorage.getItem(key);
  if (existing !== null) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function inferProgram(snapshot: SessionSnapshot | null): string | undefined {
  if (snapshot?.phase === "live") return "intro-pulse";
  if (snapshot?.phase === "holding") return "holding";
  return undefined;
}

function toWsBase(httpBase: string): string {
  return httpBase.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
