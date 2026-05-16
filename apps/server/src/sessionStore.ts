import type { Composition } from "@herd/composition";
import {
  summarizeReadiness,
  type ChoiceSnapshot,
  type EventLogEntry,
  type HostOverride,
  type ParticipantReport,
  type ParticipantSnapshot,
  type PositioningMeasurement,
  type PublicSessionInfo,
  type SessionPhase,
  type SessionSnapshot,
} from "@herd/protocol";

export interface SessionRecord {
  id: string;
  code: string;
  name: string;
  phase: SessionPhase;
  fixtureId: string;
  composition: Composition;
  createdAt: number;
  transportStartTimeMs?: number;
  participants: Map<string, ParticipantSnapshot>;
  choices: Map<string, ChoiceSnapshot>;
  hostOverrides: HostOverride[];
  logs: EventLogEntry[];
}

export interface CreateSessionInput {
  name: string;
  fixtureId?: string;
  composition: Composition;
}

export class SessionStore {
  private readonly sessionsByCode = new Map<string, SessionRecord>();
  private sessionCounter = 1;
  private logCounter = 1;

  createSession(input: CreateSessionInput, now = Date.now()): SessionSnapshot {
    const code = this.nextCode();
    const session: SessionRecord = {
      id: `session-${this.sessionCounter++}`,
      code,
      name: input.name.trim() || "Herd rehearsal",
      phase: "lobby",
      fixtureId: input.fixtureId ?? input.composition.id,
      composition: input.composition,
      createdAt: now,
      participants: new Map(),
      choices: new Map(),
      hostOverrides: [],
      logs: [],
    };

    this.sessionsByCode.set(code, session);
    this.addLog(session, "info", "Lobby opened.", now);
    return this.snapshot(session, now);
  }

  getSession(code: string): SessionRecord | undefined {
    return this.sessionsByCode.get(code.toUpperCase());
  }

  sessionCount(): number {
    return this.sessionsByCode.size;
  }

  getPublicSession(code: string, now = Date.now()): PublicSessionInfo | undefined {
    const session = this.getSession(code);
    if (session === undefined) {
      return undefined;
    }

    return {
      code: session.code,
      name: session.name,
      phase: session.phase,
      fixtureId: session.fixtureId,
    };
  }

  joinParticipant(code: string, participantId: string, now = Date.now()): SessionSnapshot {
    const session = this.requireSession(code);
    const existing = session.participants.get(participantId);

    session.participants.set(participantId, {
      ...defaultParticipantReport(),
      ...existing,
      id: participantId,
      label: existing?.label ?? `Phone ${session.participants.size + 1}`,
      connection: "connected",
      joinedAt: existing?.joinedAt ?? now,
      lastSeenAt: now,
    });

    this.addLog(session, "info", `${session.participants.get(participantId)?.label ?? "Phone"} joined.`, now);
    return this.snapshot(session, now);
  }

  markParticipantDisconnected(code: string, participantId: string, now = Date.now()): SessionSnapshot {
    const session = this.requireSession(code);
    const participant = session.participants.get(participantId);

    if (participant !== undefined) {
      session.participants.set(participantId, {
        ...participant,
        connection: "disconnected",
        lastSeenAt: now,
      });
      this.addLog(session, "warning", `${participant.label} disconnected.`, now);
    }

    return this.snapshot(session, now);
  }

  updateParticipantReport(
    code: string,
    participantId: string,
    report: ParticipantReport,
    now = Date.now(),
  ): SessionSnapshot {
    const session = this.requireSession(code);
    const existing = session.participants.get(participantId);

    if (existing === undefined) {
      throw new Error(`Participant "${participantId}" is not joined.`);
    }

    session.participants.set(participantId, {
      ...existing,
      ...report,
      lastSeenAt: now,
      connection: "connected",
    });

    return this.snapshot(session, now);
  }

  startSession(code: string, leadTimeMs = 3000, now = Date.now()): SessionSnapshot {
    const session = this.requireSession(code);
    session.phase = "live";
    session.transportStartTimeMs = now + leadTimeMs;
    this.addLog(session, "info", `Start scheduled in ${Math.round(leadTimeMs / 100) / 10}s.`, now);
    return this.snapshot(session, now);
  }

  stopSession(code: string, now = Date.now()): SessionSnapshot {
    const session = this.requireSession(code);
    session.phase = "ended";
    this.addLog(session, "warning", "Performance stopped.", now);
    return this.snapshot(session, now);
  }

  forceHolding(code: string, now = Date.now()): SessionSnapshot {
    const session = this.requireSession(code);
    session.phase = "holding";
    this.addLog(session, "warning", "Holding pattern forced.", now);
    return this.snapshot(session, now);
  }

  recordChoice(
    code: string,
    participantId: string,
    promptId: string,
    choiceId: string,
    now = Date.now(),
  ): SessionSnapshot {
    const session = this.requireSession(code);
    const key = `${promptId}:${choiceId}`;
    const existing = session.choices.get(key);
    const nextChoice: ChoiceSnapshot = {
      promptId,
      choiceId,
      count: (existing?.count ?? 0) + 1,
    };

    session.choices.set(key, nextChoice);
    this.addLog(session, "info", `${participantId} chose ${choiceId}.`, now);
    return this.snapshot(session, now);
  }

  recordHostOverride(
    code: string,
    override: Omit<HostOverride, "id" | "createdAt">,
    now = Date.now(),
  ): SessionSnapshot {
    const session = this.requireSession(code);
    const record: HostOverride = {
      ...override,
      id: `override-${this.logCounter++}`,
      createdAt: now,
    };

    session.hostOverrides.push(record);
    this.addLog(session, "warning", `Host override: ${override.type}.`, now);
    return this.snapshot(session, now);
  }

  recordPositioningMeasurements(
    code: string,
    participantId: string,
    measurements: readonly PositioningMeasurement[],
    now = Date.now(),
  ): SessionSnapshot {
    const session = this.requireSession(code);
    this.addLog(
      session,
      measurements.some((measurement) => !measurement.detected) ? "warning" : "info",
      `${participantId} uploaded ${measurements.length} positioning measurements.`,
      now,
    );
    return this.snapshot(session, now);
  }

  snapshotByCode(code: string, now = Date.now()): SessionSnapshot {
    return this.snapshot(this.requireSession(code), now);
  }

  private snapshot(session: SessionRecord, now: number): SessionSnapshot {
    const participants = [...session.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt);

    return {
      id: session.id,
      code: session.code,
      name: session.name,
      phase: session.phase,
      fixtureId: session.fixtureId,
      createdAt: session.createdAt,
      serverTimeMs: now,
      ...(session.transportStartTimeMs === undefined
        ? {}
        : { transportStartTimeMs: session.transportStartTimeMs }),
      participants,
      choices: [...session.choices.values()].sort((a, b) => `${a.promptId}:${a.choiceId}`.localeCompare(`${b.promptId}:${b.choiceId}`)),
      hostOverrides: session.hostOverrides.slice(-40),
      logs: session.logs.slice(-80),
      readiness: summarizeReadiness(participants, session.phase),
    };
  }

  private requireSession(code: string): SessionRecord {
    const session = this.getSession(code);

    if (session === undefined) {
      throw new Error(`Session "${code}" was not found.`);
    }

    return session;
  }

  private addLog(
    session: SessionRecord,
    level: EventLogEntry["level"],
    message: string,
    now: number,
  ): void {
    session.logs.push({
      id: `log-${this.logCounter++}`,
      at: now,
      level,
      message,
    });
  }

  private nextCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    do {
      code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    } while (this.sessionsByCode.has(code));

    return code;
  }
}

export function defaultParticipantReport(): ParticipantReport {
  return {
    audio: "locked",
    assetStatus: "unknown",
    visibility: "visible",
    clock: null,
    capability: {
      webAudio: false,
      degradedReasons: [],
    },
  };
}
