import { useCallback, useRef, useState } from "react";
import {
  type ModeratedMessage,
  type ModPolicy,
  type StreamContext,
  type ChatMessage,
} from "../lib/types";
import {
  callJev,
  DailyCapError,
  type ModeratePayload,
} from "../lib/jev";
import {
  decide,
  extractAnswers,
  makeFallbackMessage,
  newTimeoutState,
  checkTimeout,
} from "../lib/policy";
import type { JevResponse } from "../lib/types";

const CONCURRENCY = 6;

export interface ModerationEngine {
  moderated: ModeratedMessage[];
  timeouts: string[];
  capReached: boolean;
  capMessage: string | null;
  enqueue: (batch: ChatMessage[]) => void;
  reset: () => void;
  setOverride: (id: string, action: ModeratedMessage["action"]) => void;
}

export function useModerationEngine(
  stream: StreamContext,
  policy: ModPolicy,
  live: boolean,
  getRecorded: (msg: ChatMessage, recent: string[]) => Record<string, unknown> | null,
  getRecentContext: (upToIndex: number) => string[],
): ModerationEngine {
  const [moderated, setModerated] = useState<ModeratedMessage[]>([]);
  const [timeouts, setTimeouts] = useState<string[]>([]);
  const [capReached, setCapReached] = useState(false);
  const [capMessage, setCapMessage] = useState<string | null>(null);

  const queueRef = useRef<ChatMessage[]>([]);
  const inflightRef = useRef(0);
  const moderatedRef = useRef<Map<number, ModeratedMessage>>(new Map());
  const timeoutStateRef = useRef(newTimeoutState());
  const capRef = useRef(false);

  const pump = useCallback(() => {
    while (
      !capRef.current &&
      inflightRef.current < CONCURRENCY &&
      queueRef.current.length > 0
    ) {
      const msg = queueRef.current.shift()!;
      inflightRef.current++;
      void processOne(msg);
    }
  }, []);

  const publish = useCallback((m: ModeratedMessage) => {
    moderatedRef.current.set(m.sourceIndex, m);
    const list = [...moderatedRef.current.values()].sort(
      (a, b) => a.sourceIndex - b.sourceIndex,
    );
    setModerated(list);
  }, []);

  const processOne = useCallback(
    async (msg: ChatMessage) => {
      const recent = getRecentContext(msg.sourceIndex);
      try {
        let raw: Record<string, unknown>;
        let latency_ms = 0;
        let cost_usd = 0;
        let usage = { input_tokens: 0, output_tokens: 0 };
        let model = "jev-1.13.0";

        if (!live) {
          raw = getRecorded(msg, recent) ?? {};
          model = "jev-1.13.0-recorded";
        } else {
          const payload: ModeratePayload = {
            stream,
            message: { user: msg.username, text: msg.text },
            recent_context: recent,
          };
          const res = await callJev(payload);
          raw = (res.answers as Record<string, unknown>) ?? {};
          latency_ms = res.latency_ms;
          cost_usd = res.cost_usd;
          usage = res.usage ?? usage;
          model = res.model ?? model;
        }

        const answers = extractAnswers(raw);
        const { action, reasons } = decide(answers, policy);
        const isRepeatHide =
          action === "hidden" &&
          checkTimeout(timeoutStateRef.current, msg.username, msg.ts_offset_ms, policy);
        if (isRepeatHide) {
          setTimeouts((prev) =>
            prev.includes(msg.username) ? prev : [...prev, msg.username],
          );
        }

        const jevResponse: JevResponse = {
          answers: raw,
          model,
          usage,
          latency_ms,
          cost_usd,
        };

        publish({
          ...msg,
          jev: jevResponse,
          answers,
          action,
          override: null,
          latency_ms,
          cost_usd,
          fallback: false,
        });
      } catch (err) {
        if (err instanceof DailyCapError) {
          capRef.current = true;
          setCapReached(true);
          setCapMessage(
            err.message || "Demo daily limit reached — try Offline replay",
          );
          queueRef.current = [];
          publish(makeFallbackMessage(msg, recent, msg.sourceIndex));
          return;
        }
        publish(makeFallbackMessage(msg, recent, msg.sourceIndex));
      } finally {
        inflightRef.current--;
        pump();
      }
    },
    [live, policy, stream, getRecorded, getRecentContext, publish, pump],
  );

  const enqueue = useCallback(
    (batch: ChatMessage[]) => {
      if (capRef.current) return;
      queueRef.current.push(...batch);
      pump();
    },
    [pump],
  );

  const reset = useCallback(() => {
    queueRef.current = [];
    inflightRef.current = 0;
    moderatedRef.current = new Map();
    timeoutStateRef.current = newTimeoutState();
    capRef.current = false;
    setModerated([]);
    setTimeouts([]);
    setCapReached(false);
    setCapMessage(null);
  }, []);

  const setOverride = useCallback(
    (id: string, action: ModeratedMessage["action"]) => {
      const list = [...moderatedRef.current.values()];
      const target = list.find((m) => m.id === id);
      if (!target) return;
      const updated: ModeratedMessage = { ...target, override: action };
      moderatedRef.current.set(target.sourceIndex, updated);
      setModerated(
        [...moderatedRef.current.values()].sort(
          (a, b) => a.sourceIndex - b.sourceIndex,
        ),
      );
    },
    [],
  );

  return {
    moderated,
    timeouts,
    capReached,
    capMessage,
    enqueue,
    reset,
    setOverride,
  };
}
