import { describe, expect, it } from "vitest";
import { SessionStore } from "./sessionStore";

describe("SessionStore", () => {
  it("creates a blocked lobby until participants join and report readiness", () => {
    const store = new SessionStore();
    const created = store.createSession({ name: "Gallery test" }, 1000);

    expect(created.phase).toBe("lobby");
    expect(created.readiness.status).toBe("blocked");

    const joined = store.joinParticipant(created.code, "participant-a", 1100);
    expect(joined.participants).toHaveLength(1);
    expect(joined.readiness.status).toBe("blocked");

    const ready = store.updateParticipantReport(
      created.code,
      "participant-a",
      {
        audio: "unlocked",
        assetStatus: "loaded",
        visibility: "visible",
        clock: {
          offsetMs: 3,
          rttMs: 50,
          jitterMs: 10,
          confidence: 0.9,
          lastSyncAt: 1200,
        },
        capability: {
          webAudio: true,
          sampleRate: 48000,
          degradedReasons: [],
        },
        programId: "intro-pulse",
        voiceId: "voice-green",
      },
      1200,
    );

    expect(ready.readiness.status).toBe("ready");
    expect(ready.readiness.readyCount).toBe(1);
  });

  it("schedules start, records choices, and stops", () => {
    const store = new SessionStore();
    const created = store.createSession({ name: "Run" }, 2000);
    const started = store.startSession(created.code, 2500, 3000);

    expect(started.phase).toBe("live");
    expect(started.transportStartTimeMs).toBe(5500);

    const choice = store.recordChoice(created.code, "participant-a", "prompt-path", "choice-left", 4200);
    expect(choice.choices).toEqual([
      {
        promptId: "prompt-path",
        choiceId: "choice-left",
        count: 1,
      },
    ]);

    const stopped = store.stopSession(created.code, 5000);
    expect(stopped.phase).toBe("ended");
    expect(stopped.logs.at(-1)?.message).toBe("Performance stopped.");
  });
});
