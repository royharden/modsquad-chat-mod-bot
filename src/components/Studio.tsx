import { useCallback, useMemo, useRef, useState } from "react";
import { Header } from "./Header";
import { ChatColumn } from "./ChatColumn";
import { ModQueue } from "./ModQueue";
import { HighlightsPanel } from "./HighlightsPanel";
import { StatsBar } from "./StatsBar";
import { RecapSection } from "./RecapSection";
import { SettingsPanel } from "./SettingsPanel";
import { PasteDialog } from "./PasteDialog";
import { useModerationEngine } from "../hooks/useModerationEngine";
import { usePlayback, useStreamContext, usePolicy, type SourceMode } from "../hooks/usePlayback";
import { makeRecordedLookup, STREAM_KEYS } from "../lib/offline";
import { getRecentContext, parseChatLog } from "../lib/paste";
import { deletePastedReports } from "../lib/reports";
import type { StreamContext, ModeratedMessage, ChatMessage } from "../lib/types";
import { Trash2, Settings2 } from "lucide-react";

export function Studio() {
  const [source, setSource] = useState<SourceMode>({
    kind: "simulator",
    stream: "Elden-style boss fight",
  });
  const [mode, setMode] = useState<"live" | "offline">("offline");
  const [writerMode, setWriterMode] = useState<"llm" | "mock">("mock");
  const [showSettings, setShowSettings] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [manualContext, setManualContext] = useState<StreamContext | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const { policy, setPolicy } = usePolicy();
  const streamContext = useStreamContext(source, manualContext);

  const streamKey =
    source.kind === "simulator" ? STREAM_KEYS[source.stream] : "paste";
  const getRecorded = useMemo(() => makeRecordedLookup(streamKey), [streamKey]);
  const fullMessagesRef = useRef<ReturnType<typeof usePlayback>["messages"]>([]);

  const getRecent = useCallback((upToIndex: number) => {
    const msgs = fullMessagesRef.current;
    const from = Math.max(0, upToIndex - 4);
    return msgs.slice(from, upToIndex).map((m: ChatMessage) => `${m.username}: ${m.text}`);
  }, []);

  const engine = useModerationEngine(
    streamContext,
    policy,
    mode === "live",
    getRecorded,
    getRecent,
  );

  const handleBatch = useCallback(
    (batch: Parameters<typeof engine.enqueue>[0]) => {
      fullMessagesRef.current = [...fullMessagesRef.current, ...batch];
      engine.enqueue(batch);
    },
    [engine],
  );

  const playback = usePlayback(source, handleBatch, engine.reset);

  const handlePaste = useCallback(
    (raw: string) => {
      const messages = parseChatLog(raw);
      setSource({ kind: "paste", messages, raw });
      setShowPaste(false);
    },
    [],
  );

  const handleModeChange = useCallback(
    (next: "live" | "offline") => {
      setMode(next);
      playback.setPlaying(false);
    },
    [playback],
  );

  const deletePastedData = useCallback(async () => {
    if (source.kind !== "paste") return;
    // Best effort: the demo DB stores pasted sessions only after saving; this
    // deletes the pasted-chat reports this browser saved (via delete-reports).
    await deletePastedReports().catch(() => {});
    setSource({ kind: "simulator", stream: "Elden-style boss fight" });
  }, [source]);

  const overrideRate = useMemo(() => {
    const withAction = engine.moderated.filter((m) => m.action !== "shown");
    if (withAction.length === 0) return 0;
    const overrides = engine.moderated.filter((m) => m.override !== null).length;
    return (overrides / withAction.length) * 100;
  }, [engine.moderated]);

  return (
    <div className="min-h-screen">
      <Header
        source={source}
        onSourceChange={setSource}
        mode={mode}
        onModeChange={handleModeChange}
        writerMode={writerMode}
        onWriterModeChange={setWriterMode}
        playback={playback}
        onOpenPaste={() => setShowPaste(true)}
      />

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="flex flex-col gap-4">
          <ChatColumn
            messages={engine.moderated}
            elapsedMs={playback.elapsedMs}
            playing={playback.playing}
          />
        </section>

        <section className="flex flex-col gap-4">
          <ModQueue messages={engine.moderated} onOverride={engine.setOverride} />
          <div className="flex items-center justify-between gap-2">
            <button
              className="btn-ghost text-xs"
              onClick={deletePastedData}
              disabled={source.kind !== "paste"}
              title="Delete all pasted chat data from the demo database"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete pasted data
            </button>
            <button
              className="btn-ghost text-xs"
              onClick={() => setShowSettings((s) => !s)}
            >
              <Settings2 className="h-3.5 w-3.5" /> Mod policy
            </button>
          </div>
          {showSettings && (
            <SettingsPanel policy={policy} onChange={setPolicy} />
          )}
          {engine.capReached && (
            <div className="rounded-lg border border-toxic-500/40 bg-toxic-500/10 p-3 text-sm text-toxic-400">
              {engine.capMessage ?? "Demo daily limit reached — try Offline replay"}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <StatsBar
            messages={engine.moderated}
            overrideRate={overrideRate}
            timeouts={engine.timeouts}
          />
          <HighlightsPanel
            messages={engine.moderated}
            streamContext={streamContext}
            writerMode={writerMode}
          />
          <RecapSection
            messages={engine.moderated}
            streamContext={streamContext}
            writerMode={writerMode}
            pasted={source.kind === "paste"}
            saveState={saveState}
            setSaveState={setSaveState}
          />
        </section>
      </main>

      {showPaste && (
        <PasteDialog onClose={() => setShowPaste(false)} onPaste={handlePaste} />
      )}
    </div>
  );
}

export type { ModeratedMessage };
