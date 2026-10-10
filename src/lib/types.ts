export interface StreamContext {
  title: string;
  progress: string;
  spoiler_free_until: string;
}

export type Topic =
  | "gameplay"
  | "streamer"
  | "tech"
  | "community"
  | "off_topic"
  | "uncertain";

export type Action = "shown" | "hidden" | "spoiler" | "highlight" | "review";

export interface ModPolicy {
  hide_toxic: number;
  hide_spam: number;
  blur_spoiler: number;
  highlight_question: number;
  timeout_hide_count: number;
  timeout_window_ms: number;
}

export const DEFAULT_POLICY: ModPolicy = {
  hide_toxic: 2.5,
  hide_spam: 0.8,
  blur_spoiler: 0.6,
  highlight_question: 0.7,
  timeout_hide_count: 3,
  timeout_window_ms: 5 * 60 * 1000,
};

export interface JevAnswers {
  toxic: number;
  toxic_conf: number;
  spoiler: number;
  question: number;
  spam: number;
  injection: number;
  topic: Topic;
  injection_flag: boolean;
}

export interface JevResponse {
  answers?: Record<string, unknown>;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
  latency_ms?: number;
  cost_usd?: number;
  fallback?: boolean;
  error?: string;
}

export interface ChatMessage {
  id: string;
  ts_offset_ms: number;
  username: string;
  text: string;
  sourceIndex: number;
}

export interface ModeratedMessage extends ChatMessage {
  jev?: JevResponse;
  answers?: JevAnswers;
  action: Action;
  override: Action | null;
  latency_ms: number | null;
  cost_usd: number | null;
  fallback: boolean;
}

export const TOXIC_LABELS = [
  "None",
  "Mild",
  "Moderate",
  "Severe",
] as const;

export const TOPIC_LABELS: Record<Topic, string> = {
  gameplay: "Gameplay / show",
  streamer: "The streamer",
  tech: "Tech / setup",
  community: "Community / memes",
  off_topic: "Off-topic",
  uncertain: "Uncertain",
};
