import { useEffect, useRef } from 'react';
import type { Persona } from '@/types';
import type { PersonaChatMessage, TagType } from '@/types/chat';
import { PersonaChatMessageBubble } from './PersonaChatMessage';
import { PersonaChatThinking } from './PersonaChatThinking';
import { getInitialSuggestions } from './suggestions';

interface Props {
  persona: Persona;
  messages: PersonaChatMessage[];
  isLoading: boolean;
  showTrait: boolean;
  onSendSuggestion: (text: string) => void;
  onFeedback: (id: number, value: 'up' | 'down' | null) => void;
  onToggleTag: (id: number, tag: TagType) => void;
  onRetry: (id: number, content: string) => void;
}

export function PersonaChatThread({
  persona,
  messages,
  isLoading,
  showTrait,
  onSendSuggestion,
  onFeedback,
  onToggleTag,
  onRetry,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  const suggestions = getInitialSuggestions(persona);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      {/* Session lead card — the green rule is the one signal that this is a synthetic interview. */}
      <div className="mx-4 mt-4 mb-2 border border-l-4 border-border border-l-signal-goal bg-card p-4">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.15em] text-signal-goal">
          Chatting with {persona.name}
        </div>
        <div className="font-mono text-xs text-muted-foreground">{persona.role}</div>
        <div className="mt-2 font-mono text-[10px] text-muted-foreground/70">
          Synthetic interview — responses are AI-generated from persona hypotheses, not real user data.
        </div>
      </div>

      {/* Empty state: suggestion grid */}
      {messages.length === 0 && !isLoading && (
        <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSendSuggestion(s.text)}
              className="border border-foreground/20 bg-background p-3 text-left transition-colors hover:border-foreground/60 hover:bg-accent"
            >
              <div className={`mb-1 font-mono text-[10px] uppercase tracking-[0.15em] ${s.type === 'friction' ? 'text-destructive' : 'text-signal-goal'}`}>
                {s.type}
              </div>
              <div className="font-mono text-xs">{s.text}</div>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="divide-y divide-border/30">
        {messages.map(msg => (
          <PersonaChatMessageBubble
            key={msg.id}
            message={msg}
            personaName={persona.name}
            showTrait={showTrait}
            isLoading={isLoading}
            onFeedback={onFeedback}
            onToggleTag={onToggleTag}
            onRetry={onRetry}
          />
        ))}
      </div>

      {/* Thinking indicator */}
      {isLoading && (
        <div className="border-t border-border/30">
          <PersonaChatThinking persona={persona} />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
