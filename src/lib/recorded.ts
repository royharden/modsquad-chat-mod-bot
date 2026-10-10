import { Rng, seededSeed } from "./rng";
import type { ChatMessage } from "./types";

type Overrides = Record<number, Partial<Record<string, number | string>>>;

const BOSS_OVERRIDES: Overrides = {
  8: { toxic: 2.6, toxic_conf: 0.88 },
  15: { toxic: 2.8, toxic_conf: 0.9 },
  16: { toxic: 2.9, toxic_conf: 0.91 },
  17: { spam: 0.92, toxic_conf: 0.85 },
  18: { injection: 0.9, toxic_conf: 0.87 },
};

const FINALE_OVERRIDES: Overrides = {
  10: { spoiler: 0.88, toxic_conf: 0.8 },
  19: { spoiler: 0.91, toxic_conf: 0.82 },
};

const CODING_OVERRIDES: Overrides = {
  15: { spam: 0.9, toxic_conf: 0.83 },
  21: { toxic: 2.7, toxic_conf: 0.84 },
};

function defaultScores(text: string, username: string, seed: string, i: number) {
  const rng = new Rng(seededSeed(`${seed}:${i}`));
  const isQuestion = text.includes("?");
  const isEmote = text.length <= 10 && text === text.toUpperCase() && /[A-Z]/.test(text);
  // A few lines land in the mild-to-moderate band so the mod queue gets work.
  const toxic =
    rng.next() < 0.08 ? 1.2 + rng.next() * 1.1 : rng.next() * 0.6;
  return {
    toxic: Math.round(toxic * 1000) / 1000,
    toxic_conf: Math.round((0.72 + rng.next() * 0.25) * 1000) / 1000,
    spoiler: Math.round(rng.next() * 0.25 * 1000) / 1000,
    question: isQuestion ? Math.round((0.72 + rng.next() * 0.25) * 1000) / 1000 : Math.round(rng.next() * 0.3 * 1000) / 1000,
    spam: isEmote ? 0.05 : Math.round(rng.next() * 0.2 * 1000) / 1000,
    injection: 0.02,
    topic: isQuestion ? "streamer" : isEmote ? "community" : "gameplay",
  };
}

export function recordedResponseFor(
  msg: ChatMessage,
  streamSeed: string,
  overrides: Overrides,
): Record<string, unknown> {
  const o = overrides[msg.sourceIndex] ?? {};
  const d = defaultScores(msg.text, msg.username, streamSeed, msg.sourceIndex);
  return {
    toxic: { score: (o.toxic as number) ?? d.toxic, confidence: (o.toxic_conf as number) ?? d.toxic_conf },
    spoiler: { noul: (o.spoiler as number) ?? d.spoiler },
    question: { noul: (o.question as number) ?? d.question },
    spam: { noul: (o.spam as number) ?? d.spam },
    injection: { noul: (o.injection as number) ?? d.injection },
    topic: { choice: (o.topic as string) ?? d.topic, confidence: 0.85 },
    model: "jev-1.13.0-recorded",
  };
}

export const STREAM_OVERRIDES: Record<string, Overrides> = {
  "boss-fight": BOSS_OVERRIDES,
  "finale-watch": FINALE_OVERRIDES,
  "coding-qa": CODING_OVERRIDES,
};
