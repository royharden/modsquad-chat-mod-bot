import { useState } from "react";
import { X } from "lucide-react";

export function PasteDialog({
  onClose,
  onPaste,
}: {
  onClose: () => void;
  onPaste: (raw: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const lines = raw.split("\n").filter((l) => l.trim()).length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Paste a chat log</h2>
          <button className="btn-ghost px-2 py-1" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-studio-300">
          One message per line, either{" "}
          <code className="rounded bg-studio-800 px-1 font-mono text-xs">
            HH:MM:SS username: text
          </code>{" "}
          or{" "}
          <code className="rounded bg-studio-800 px-1 font-mono text-xs">
            username: text
          </code>
          . Pasted logs are stored only in this demo's database and can be
          deleted with one button.
        </p>
        <textarea
          className="mb-3 h-56 w-full resize-none rounded-lg border border-studio-600 bg-studio-850 p-3 font-mono text-sm text-studio-100 focus:border-question-500/60 focus:outline-none"
          placeholder={"00:01:12 pixel_fox: lets gooo!\ngg_hana: what build is that?"}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-studio-400">
            {lines} message{lines === 1 ? "" : "s"} detected
          </span>
          <button
            className="btn-primary"
            disabled={lines === 0}
            onClick={() => onPaste(raw)}
          >
            Load log
          </button>
        </div>
      </div>
    </div>
  );
}
