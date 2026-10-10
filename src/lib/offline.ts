import {
  type ChatMessage,
  type StreamContext,
  DEFAULT_POLICY,
} from "../lib/types";
import { recordedResponseFor, STREAM_OVERRIDES } from "../lib/recorded";

export function makeRecordedLookup(streamKey: string) {
  const overrides = STREAM_OVERRIDES[streamKey] ?? {};
  return (msg: ChatMessage, _recent: string[]): Record<string, unknown> =>
    recordedResponseFor(msg, streamKey, overrides);
}

export const STREAM_KEYS: Record<string, string> = {
  "Elden-style boss fight": "boss-fight",
  "Season finale watch party": "finale-watch",
  "Coding stream Q&A": "coding-qa",
};

export function emptyContext(): StreamContext {
  return { title: "", progress: "", spoiler_free_until: "" };
}

export { DEFAULT_POLICY };
