import { useCallback, useMemo, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { ShieldAlert, ExternalLink } from "lucide-react";
import { Studio } from "./components/Studio";
import { RulesPage } from "./components/RulesPage";
import { ReportPage } from "./components/ReportPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Studio />} />
      <Route path="/rules" element={<RulesPage />} />
      <Route path="/r/:slug" element={<ReportPage />} />
    </Routes>
  );
}

export function SimulationBadge() {
  return (
    <Link
      to="/rules"
      className="inline-flex items-center gap-1.5 rounded-full border border-question-500/40 bg-question-500/10 px-3 py-1 text-xs font-medium text-question-400 hover:bg-question-500/20"
    >
      <ShieldAlert className="h-3.5 w-3.5" />
      Simulation only — never posts to real chats
      <ExternalLink className="h-3 w-3 opacity-60" />
    </Link>
  );
}

export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable — session-only
      }
    },
    [key],
  );
  return [value, update] as const;
}
