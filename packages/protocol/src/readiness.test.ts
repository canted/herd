import { describe, expect, it } from "vitest";
import { summarizeReadiness, type ParticipantSnapshot } from "./index";

const baseParticipant: ParticipantSnapshot = {
  id: "participant-1",
  label: "Phone 1",
  connection: "connected",
  joinedAt: 1000,
  lastSeenAt: 1200,
  audio: "unlocked",
  assetStatus: "loaded",
  visibility: "visible",
  clock: {
    offsetMs: 4,
    rttMs: 42,
    jitterMs: 12,
    confidence: 0.94,
    lastSyncAt: 1100,
  },
  capability: {
    webAudio: true,
    sampleRate: 48000,
    degradedReasons: [],
  },
};

describe("summarizeReadiness", () => {
  it("blocks an empty lobby", () => {
    const summary = summarizeReadiness([], "lobby");

    expect(summary.status).toBe("blocked");
    expect(summary.topBlockers[0]).toMatch("No Participant");
  });

  it("marks a fully prepared connected group as ready", () => {
    const summary = summarizeReadiness([baseParticipant], "lobby");

    expect(summary.status).toBe("ready");
    expect(summary.readyCount).toBe(1);
    expect(summary.recommendedAction).toMatch("Start");
  });

  it("marks high jitter as degraded", () => {
    const summary = summarizeReadiness(
      [
        {
          ...baseParticipant,
          clock: { ...baseParticipant.clock!, jitterMs: 80, confidence: 0.68 },
        },
      ],
      "lobby",
    );

    expect(summary.status).toBe("degraded");
    expect(summary.audienceImpact).toContain("1 phone may drift or miss cues.");
  });

  it("blocks devices that have not unlocked audio", () => {
    const summary = summarizeReadiness(
      [
        {
          ...baseParticipant,
          audio: "locked",
        },
      ],
      "lobby",
    );

    expect(summary.status).toBe("blocked");
    expect(summary.topBlockers).toContain("Some phones still need audio unlock.");
  });
});
