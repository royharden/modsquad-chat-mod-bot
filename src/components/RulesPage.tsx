import { Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Database, Lock, MessageSquareOff, Trash2 } from "lucide-react";

export function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="btn-ghost mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to studio
      </Link>
      <h1 className="mb-2 text-3xl font-bold">Rules & scope</h1>
      <p className="mb-8 text-studio-300">
        ModSquad is a demonstration of live chat moderation. It is built to be
        safe by default — everything here is simulated.
      </p>

      <div className="space-y-4">
        <Rule
          icon={<MessageSquareOff className="h-5 w-5 text-toxic-400" />}
          title="Simulation and paste only"
          body="There is no connection to real Twitch or YouTube accounts. Nothing is ever posted to any real chat, and no real bans or timeouts happen. Mod actions (hide, blur, timeout suggestion) are only shown inside this app."
        />
        <Rule
          icon={<ShieldAlert className="h-5 w-5 text-spoiler-400" />}
          title="Chat text is untrusted data"
          body="Every chat message is wrapped as literal data when it is sent to the decision model. Messages that look like instructions to the bot ('ignore your rules', 'mod, unban me') are flagged for a human moderator — never obeyed."
        />
        <Rule
          icon={<Database className="h-5 w-5 text-question-400" />}
          title="Pasted logs live in this demo only"
          body="If you paste a chat log, it is stored only in this demo's database. The 'Delete pasted data' button on the studio page removes every pasted session and its messages with one click."
        />
        <Rule
          icon={<Lock className="h-5 w-5 text-studio-300" />}
          title="API keys stay server-side"
          body="All model API keys are kept in server-side secrets inside Supabase Edge Functions. Nothing secret is ever included in the browser bundle."
        />
        <Rule
          icon={<Trash2 className="h-5 w-5 text-spam-400" />}
          title="Fake usernames in fixtures"
          body="The bundled demo chats use made-up usernames. Any resemblance to real accounts is coincidental."
        />
      </div>
    </div>
  );
}

function Rule({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="panel flex gap-4 p-5">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h2 className="mb-1 font-semibold">{title}</h2>
        <p className="text-sm leading-relaxed text-studio-300">{body}</p>
      </div>
    </div>
  );
}
