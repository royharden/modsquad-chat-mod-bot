import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, ShieldAlert, Lock } from "lucide-react";
import { supabase } from "../lib/supabase";

interface ReportSession {
  slug: string;
  source: string;
  stream_context: { title?: string; progress?: string; spoiler_free_until?: string };
  stats: Record<string, number>;
  recap: {
    headline: string;
    highlights: string[];
    top_questions: string[];
    mod_summary: string;
    chat_mood: string;
  } | null;
  writer_mode: string | null;
  created_at: string;
}

export function ReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const [session, setSession] = useState<ReportSession | null>(null);
  const [state, setState] = useState<"loading" | "found" | "missing" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .eq("slug", slug ?? "")
        .maybeSingle();
      if (cancelled) return;
      if (error) setState("error");
      else if (!data) setState("missing");
      else {
        setSession(data as ReportSession);
        setState("found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" className="btn-ghost">
          <ArrowLeft className="h-4 w-4" /> ModSquad
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-question-500/40 bg-question-500/10 px-3 py-1 text-xs font-medium text-question-400">
          <Lock className="h-3 w-3" /> Read-only report
        </span>
      </div>

      {state === "loading" && <p className="text-studio-400">Loading…</p>}
      {state === "missing" && (
        <p className="text-studio-400">
          No report found for this link. It may have been deleted.
        </p>
      )}
      {state === "error" && (
        <p className="text-toxic-400">Couldn't load the report. Try again.</p>
      )}
      {state === "found" && session && (
        <article className="space-y-6">
          <header>
            <p className="mb-1 text-xs uppercase tracking-wide text-studio-500">
              End-of-stream report · {new Date(session.created_at).toLocaleString()}
            </p>
            <h1 className="text-2xl font-bold leading-snug">
              {session.recap?.headline ?? session.source}
            </h1>
            {session.stream_context?.title && (
              <p className="mt-1 text-sm text-studio-400">
                {session.stream_context.title}
                {session.stream_context.progress &&
                  ` · ${session.stream_context.progress}`}
              </p>
            )}
          </header>

          {session.recap && (
            <>
              <Section title="Highlights">
                <ul className="list-inside list-disc space-y-1 text-sm text-studio-200">
                  {session.recap.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </Section>
              {session.recap.top_questions?.length > 0 && (
                <Section title="Top questions">
                  <ul className="list-inside list-disc space-y-1 text-sm text-studio-200">
                    {session.recap.top_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </Section>
              )}
              <Section title="Moderation summary">
                <p className="text-sm text-studio-300">{session.recap.mod_summary}</p>
              </Section>
              <Section title="Chat mood">
                <p className="text-sm font-semibold capitalize text-spoiler-400">
                  {session.recap.chat_mood}
                </p>
              </Section>
            </>
          )}

          <Section title="Session stats">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {Object.entries(session.stats ?? {}).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-studio-850 px-2.5 py-2">
                  <p className="text-[10px] text-studio-400">
                    {k.split("_").join(" ")}
                  </p>
                  <p className="font-mono text-sm font-semibold">{v}</p>
                </div>
              ))}
            </div>
          </Section>

          <p className="flex items-center gap-1.5 border-t border-studio-700 pt-4 text-xs text-studio-500">
            <ShieldAlert className="h-3.5 w-3.5" />
            Simulation only — never posts to real chats.
          </p>
        </article>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-400">
        {title}
      </h2>
      {children}
    </section>
  );
}
