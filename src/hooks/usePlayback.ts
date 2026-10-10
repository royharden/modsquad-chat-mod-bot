import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SIMULATOR_CONTEXT, type SimulatorName } from "../lib/fixtures";
import type { ChatMessage, ModPolicy, StreamContext } from "../lib/types";
import { DEFAULT_POLICY } from "../lib/types";

export type SourceMode = { kind: "simulator"; stream: SimulatorName } | {
  kind: "paste";
  messages: ChatMessage[];
  raw: string;
};

export interface PlaybackState {
  playing: boolean;
  speed: 1 | 2 | 5;
  elapsedMs: number;
  durationMs: number;
  progressPercent: number;
}

export function usePlayback(
  source: SourceMode,
  onBatch: (msgs: ChatMessage[]) => void,
  resetEngine: () => void,
) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 5>(2);
  const [elapsedMs, setElapsedMs] = useState(0);

  const messages = useMemo(() => {
    if (source.kind === "simulator") {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const builders = require0();
      return builders[source.stream]();
    }
    return source.messages;
  }, [source]);

  const durationMs = useMemo(
    () => (messages.length > 0 ? messages[messages.length - 1].ts_offset_ms + 1000 : 0),
    [messages],
  );

  const cursorRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const batchRef = useRef<ChatMessage[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (batchRef.current.length > 0) {
      onBatch(batchRef.current);
      batchRef.current = [];
    }
  }, [onBatch]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flush();
    }, 120);
  }, [flush]);

  useEffect(() => {
    cursorRef.current = 0;
    setElapsedMs(0);
    setPlaying(false);
    resetEngine();
    batchRef.current = [];
  }, [source, resetEngine]);

  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null;
      flush();
      return;
    }
    const tick = (now: number) => {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const delta = (now - lastTickRef.current) * speed;
      lastTickRef.current = now;
      setElapsedMs((prev) => {
        const next = prev + delta;
        while (
          cursorRef.current < messages.length &&
          messages[cursorRef.current].ts_offset_ms <= next
        ) {
          batchRef.current.push(messages[cursorRef.current]);
          cursorRef.current++;
        }
        if (batchRef.current.length > 0) scheduleFlush();
        if (next >= durationMs) {
          setPlaying(false);
          return durationMs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, messages, durationMs, scheduleFlush]);

  const seek = useCallback(
    (percent: number) => {
      const target = (percent / 100) * durationMs;
      cursorRef.current = messages.findIndex((m) => m.ts_offset_ms > target);
      if (cursorRef.current === -1) cursorRef.current = messages.length;
      setElapsedMs(target);
      batchRef.current = [];
    },
    [durationMs, messages],
  );

  return {
    messages,
    playing,
    setPlaying,
    speed,
    setSpeed,
    elapsedMs,
    durationMs,
    seek,
  };
}

// The fixtures module is imported lazily to keep the simulator builders together.
import { FIXTURE_BUILDERS } from "../lib/fixtures";
function require0() {
  return FIXTURE_BUILDERS;
}

export function useStreamContext(
  source: SourceMode,
  manual: StreamContext | null,
): StreamContext {
  return useMemo(() => {
    if (manual) return manual;
    if (source.kind === "simulator") return SIMULATOR_CONTEXT[source.stream];
    return { title: "Pasted chat log", progress: "", spoiler_free_until: "" };
  }, [source, manual]);
}

export function usePolicy() {
  const [policy, setPolicy] = useState<ModPolicy>(DEFAULT_POLICY);
  return { policy, setPolicy };
}
