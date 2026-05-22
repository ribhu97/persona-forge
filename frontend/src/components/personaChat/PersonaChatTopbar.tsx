import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Persona } from '@/types';
import type { PersonaChatSessionState } from '@/types/chat';

interface Props {
  persona: Persona;
  session: PersonaChatSessionState | undefined;
  onRestart: () => void;
}

export function PersonaChatTopbar({ persona, session, onRestart }: Props) {
  const navigate = useNavigate();
  const [restartHovered, setRestartHovered] = useState(false);
  const hasMessages = (session?.messages.length ?? 0) > 0;

  const handleRestart = () => {
    if (!hasMessages) return;
    if (confirm(`Clear the conversation with ${persona.name}? This cannot be undone.`)) {
      onRestart();
    }
  };

  return (
    <div
      className="flex items-center border-b border-border px-4 shrink-0"
      style={{ height: 48, background: 'hsl(var(--background))' }}
    >
      {/* PEHLOO mark */}
      <span
        className="text-xl mr-3 shrink-0"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
      >
        PEHLOO
      </span>

      <span className="text-[11px] font-mono text-muted-foreground/50 mr-2 shrink-0">/</span>
      <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-muted-foreground mr-2 shrink-0">PERSONAFORGE</span>

      <span className="text-[11px] font-mono text-muted-foreground/50 mr-2 shrink-0">/</span>
      <button
        onClick={() => navigate('/')}
        className="text-[11px] font-mono tracking-[0.15em] uppercase text-muted-foreground hover:text-foreground transition-colors mr-2 shrink-0"
      >
        ← BACK TO PERSONAS
      </button>

      <span className="text-[11px] font-mono text-muted-foreground/50 mr-2 shrink-0">/</span>
      <span className="text-[11px] font-mono tracking-[0.15em] uppercase mr-2 shrink-0">
        CHATTING WITH {persona.name.toUpperCase()}
      </span>

      <span className="text-[11px] font-mono text-muted-foreground/50 mr-2 shrink-0">/</span>
      <span className="text-[11px] font-mono tracking-[0.12em] uppercase text-[#4a7c59] mr-2 shrink-0 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4a7c59] inline-block animate-pulse" />
        SESSION ACTIVE
      </span>

      <div className="ml-auto flex gap-2 shrink-0">
        <button
          onClick={handleRestart}
          disabled={!hasMessages}
          onMouseEnter={() => setRestartHovered(true)}
          onMouseLeave={() => setRestartHovered(false)}
          className="text-[11px] font-mono tracking-[0.12em] uppercase px-3 py-1 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
          style={{
            borderRadius: 0,
            border: restartHovered && hasMessages
              ? '1px solid hsl(var(--foreground))'
              : '1px solid hsl(var(--foreground) / 0.3)',
            background: restartHovered && hasMessages ? 'hsl(var(--foreground) / 0.08)' : 'transparent',
          }}
        >
          RESTART
        </button>
        <button
          disabled
          title="Coming soon"
          className="text-[11px] font-mono tracking-[0.12em] uppercase px-3 py-1 border border-foreground/20 opacity-30 cursor-not-allowed"
          style={{ borderRadius: 0 }}
        >
          EXPORT
        </button>
      </div>
    </div>
  );
}
