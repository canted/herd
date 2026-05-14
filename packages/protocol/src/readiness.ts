import type {
  ParticipantSnapshot,
  ReadinessSummary,
  SessionPhase,
} from "./types";

export function summarizeReadiness(
  participants: readonly ParticipantSnapshot[],
  phase: SessionPhase,
): ReadinessSummary {
  const connected = participants.filter((participant) => participant.connection === "connected");
  const participantStates = connected.map(classifyParticipant);
  const readyCount = participantStates.filter((state) => state === "ready").length;
  const degradedCount = participantStates.filter((state) => state === "degraded").length;
  const blockedCount = participantStates.filter((state) => state === "blocked").length;
  const topBlockers = collectTopBlockers(connected);
  const audienceImpact = collectAudienceImpact(connected);

  if (connected.length === 0) {
    return {
      status: "blocked",
      readyCount: 0,
      degradedCount: 0,
      blockedCount: 0,
      connectedCount: 0,
      topBlockers: ["No Participant devices are connected."],
      audienceImpact: ["The room has no active phones."],
      recommendedAction: "Open the lobby and have Participants scan the QR code.",
    };
  }

  if (blockedCount > 0) {
    return {
      status: "blocked",
      readyCount,
      degradedCount,
      blockedCount,
      connectedCount: connected.length,
      topBlockers,
      audienceImpact,
      recommendedAction:
        phase === "live"
          ? "Stop or force holding while blocked devices recover."
          : "Resolve blocked devices before starting.",
    };
  }

  if (degradedCount > 0 || readyCount < connected.length) {
    return {
      status: "degraded",
      readyCount,
      degradedCount,
      blockedCount,
      connectedCount: connected.length,
      topBlockers,
      audienceImpact,
      recommendedAction:
        "You can rehearse, but confirm the audience-visible impact before starting.",
    };
  }

  return {
    status: "ready",
    readyCount,
    degradedCount,
    blockedCount,
    connectedCount: connected.length,
    topBlockers: [],
    audienceImpact: ["All connected phones are ready for the rehearsal fixture."],
    recommendedAction: phase === "lobby" ? "Start when the room is ready." : "Continue monitoring.",
  };
}

export function classifyParticipant(
  participant: ParticipantSnapshot,
): "ready" | "degraded" | "blocked" {
  if (participant.connection !== "connected") {
    return "blocked";
  }

  if (participant.audio === "failed" || participant.assetStatus === "failed") {
    return "blocked";
  }

  if (participant.audio !== "unlocked" || participant.assetStatus !== "loaded") {
    return "blocked";
  }

  if (participant.clock === null) {
    return "degraded";
  }

  if (participant.clock.confidence < 0.35 || participant.clock.rttMs > 350) {
    return "blocked";
  }

  if (
    participant.clock.confidence < 0.7 ||
    participant.clock.rttMs > 180 ||
    participant.clock.jitterMs > 60 ||
    participant.visibility === "hidden" ||
    participant.capability.degradedReasons.length > 0
  ) {
    return "degraded";
  }

  return "ready";
}

function collectTopBlockers(participants: readonly ParticipantSnapshot[]): string[] {
  const blockers = new Set<string>();

  for (const participant of participants) {
    if (participant.audio === "locked") blockers.add("Some phones still need audio unlock.");
    if (participant.audio === "failed") blockers.add("At least one phone cannot start audio.");
    if (participant.assetStatus === "unknown") blockers.add("Some phones are still loading the fixture.");
    if (participant.assetStatus === "failed") blockers.add("At least one phone failed to load fixture assets.");
    if (participant.clock === null) blockers.add("Some phones have not completed clock sync.");
    if (participant.clock !== null && participant.clock.rttMs > 180) {
      blockers.add("Some phones have high network round-trip time.");
    }
    if (participant.clock !== null && participant.clock.jitterMs > 60) {
      blockers.add("Some phones have unstable clock sync.");
    }
    if (participant.visibility === "hidden") blockers.add("Some phones are backgrounded or hidden.");
  }

  return [...blockers].slice(0, 4);
}

function collectAudienceImpact(participants: readonly ParticipantSnapshot[]): string[] {
  const impacts = new Set<string>();

  const audioLocked = participants.filter((participant) => participant.audio !== "unlocked").length;
  const hidden = participants.filter((participant) => participant.visibility === "hidden").length;
  const poorSync = participants.filter(
    (participant) =>
      participant.clock === null ||
      participant.clock.confidence < 0.7 ||
      participant.clock.rttMs > 180 ||
      participant.clock.jitterMs > 60,
  ).length;

  if (audioLocked > 0) impacts.add(`${audioLocked} phone${audioLocked === 1 ? "" : "s"} may be silent.`);
  if (hidden > 0) impacts.add(`${hidden} phone${hidden === 1 ? "" : "s"} may not show visuals.`);
  if (poorSync > 0) impacts.add(`${poorSync} phone${poorSync === 1 ? "" : "s"} may drift or miss cues.`);

  if (impacts.size === 0) {
    impacts.add("No audience-visible degradation is currently detected.");
  }

  return [...impacts];
}
