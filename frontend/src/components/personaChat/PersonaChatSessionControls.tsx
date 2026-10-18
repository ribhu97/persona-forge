import { Button } from '@/components/ui/button';
import { usePersonaChatStore } from '@/stores/personaChatStore';
import { cn } from '@/lib/utils';

interface Props {
  personaId: number;
  personaName: string;
}

/**
 * Session status + restart. Shared by the standalone chat page's top bar and the embedded
 * window's title bar so the two placements cannot drift apart.
 */
export function PersonaChatSessionControls({ personaId, personaName }: Props) {
  const session = usePersonaChatStore(state => state.sessions[personaId]);
  const clearSession = usePersonaChatStore(state => state.clearSession);

  const hasMessages = (session?.messages.length ?? 0) > 0;
  const isLoading = session?.isLoading ?? false;

  const handleRestart = () => {
    if (!hasMessages) return;
    if (confirm(`Clear the conversation with ${personaName}? This cannot be undone.`)) {
      void clearSession(personaId);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className={cn('h-1.5 w-1.5', isLoading ? 'animate-pulse bg-signal-mood' : 'bg-signal-goal')} />
        {isLoading ? 'Responding' : 'Session active'}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[10px]"
        onClick={handleRestart}
        disabled={!hasMessages}
        title="Clear this conversation"
      >
        Restart
      </Button>
    </div>
  );
}
