import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { usePersonaStore } from '@/stores/personaStore';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PehlooFaceMark } from '@/components/ui/PehlooFaceMark';

interface SidebarProps {
  className?: string;
  onLoginClick?: () => void;
  onSelectIdea?: () => void;
}

export function Sidebar({ className, onLoginClick, onSelectIdea }: SidebarProps) {
  const { conversations, currentConversationId, fetchConversations, selectConversation, clearCurrentConversation, deleteConversation } = useChatStore();
  const { isAuthenticated } = useAuthStore();
  const { clearAll } = usePersonaStore();

  useEffect(() => {
    if (isAuthenticated) fetchConversations();
  }, [fetchConversations, isAuthenticated]);

  const handleNewIdea = () => {
    clearCurrentConversation();
    clearAll();
    onSelectIdea?.();
  };

  return (
    <div className={cn('flex h-full w-full flex-col bg-card', className)}>
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2 font-semibold"><PehlooFaceMark size={18} flicker={1} /><Lightbulb className="h-4 w-4" />Ideas</div>
        {isAuthenticated && <Button onClick={handleNewIdea} size="sm" variant="outline" className="h-8 gap-1.5 rounded-none"><Plus className="h-3.5 w-3.5" />New idea</Button>}
      </div>

      {!isAuthenticated && (
        <div className="space-y-3 border-b border-border px-4 py-5 text-sm text-muted-foreground">
          <p>Sign in to see your saved ideas.</p>
          {onLoginClick && <button onClick={onLoginClick} className="font-medium text-foreground underline underline-offset-4">Sign in →</button>}
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.map(idea => (
          <div key={idea.id} className="group relative">
            <button
              onClick={() => { selectConversation(idea.id); onSelectIdea?.(); }}
              className={cn('w-full rounded-none px-3 py-3 pr-10 text-left transition-colors', currentConversationId === idea.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              <span className="block truncate text-sm font-medium">{idea.title || 'Untitled idea'}</span>
              <span className="mt-1 block text-xs opacity-70">{new Date(idea.last_message_at).toLocaleDateString()}</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete idea"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
              onClick={event => {
                event.stopPropagation();
                if (confirm('Delete this idea and its history?')) deleteConversation(idea.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
