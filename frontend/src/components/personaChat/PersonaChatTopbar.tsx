import { useNavigate } from 'react-router-dom';
import type { Persona } from '@/types';
import { PersonaChatSessionControls } from './PersonaChatSessionControls';

interface Props {
  persona: Persona;
  onClose?: () => void;
}

/**
 * Header for the standalone `/chat/:personaId` route only. When the chat is embedded in the
 * canvas window the title bar already names it, so rendering this too would stack two nav bars.
 */
export function PersonaChatTopbar({ persona, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b-2 border-border bg-card px-4">
      <span className="shrink-0 font-display text-lg tracking-tight">PEHLOO</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/50">/</span>
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">PersonaForge</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/50">/</span>
      <button
        onClick={() => onClose ? onClose() : navigate('/')}
        className="shrink-0 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to personas
      </button>
      <span className="ml-2 min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.12em]">
        {persona.name}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <PersonaChatSessionControls personaId={Number(persona.id)} personaName={persona.name} />
      </div>
    </div>
  );
}
