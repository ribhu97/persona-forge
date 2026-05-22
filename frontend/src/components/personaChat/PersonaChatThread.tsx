import { useEffect, useRef, useState } from 'react';
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
}

export function PersonaChatThread({
  persona,
  messages,
  isLoading,
  showTrait,
  onSendSuggestion,
  onFeedback,
  onToggleTag,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hoveredSuggestion, setHoveredSuggestion] = useState<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  const suggestions = getInitialSuggestions(persona);

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{
        background: `
          repeating-linear-gradient(0deg, transparent, transparent 23px, hsl(var(--border) / 0.35) 23px, hsl(var(--border) / 0.35) 24px),
          repeating-linear-gradient(90deg, transparent, transparent 23px, hsl(var(--border) / 0.35) 23px, hsl(var(--border) / 0.35) 24px),
          hsl(var(--background))
        `,
      }}
    >
      {/* Session lead card */}
      <div
        className="mx-4 mt-4 mb-2 p-4"
        style={{
          background: 'hsl(var(--background))',
          borderTop: '1px solid hsl(var(--border))',
          borderRight: '1px solid hsl(var(--border))',
          borderBottom: '1px solid hsl(var(--border))',
          borderLeft: '4px solid #4a7c59',
          borderRadius: 0,
        }}
      >
        <div className="text-[11px] font-mono tracking-[0.15em] uppercase mb-1" style={{ color: '#4a7c59' }}>
          CHATTING WITH {persona.name.toUpperCase()}
        </div>
        <div className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {persona.role}
        </div>
        <div className="text-[10px] font-mono mt-2" style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>
          Synthetic interview — responses are AI-generated from persona hypotheses, not real user data.
        </div>
      </div>

      {/* Empty state: suggestion grid */}
      {messages.length === 0 && !isLoading && (
        <div className="grid grid-cols-2 gap-2 mx-4 mt-4">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSendSuggestion(s.text)}
              onMouseEnter={() => setHoveredSuggestion(i)}
              onMouseLeave={() => setHoveredSuggestion(null)}
              className="text-left p-3 transition-all duration-150"
              style={{
                borderRadius: 0,
                background: 'hsl(var(--background))',
                border: hoveredSuggestion === i
                  ? `1px solid hsl(var(--foreground) / 0.6)`
                  : `1px solid hsl(var(--foreground) / 0.2)`,
                boxShadow: hoveredSuggestion === i ? '2px 2px 0 hsl(var(--foreground) / 0.15)' : 'none',
              }}
            >
              <div
                className="text-[9px] font-mono tracking-[0.15em] uppercase mb-1"
                style={{ color: s.type === 'friction' ? '#c0392b' : '#4a7c59' }}
              >
                {s.type}
              </div>
              <div className="text-xs font-mono">{s.text}</div>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="divide-y" style={{ borderColor: 'hsl(var(--border) / 0.3)' }}>
        {messages.map(msg => (
          <PersonaChatMessageBubble
            key={msg.id}
            message={msg}
            personaName={persona.name}
            showTrait={showTrait}
            onFeedback={onFeedback}
            onToggleTag={onToggleTag}
          />
        ))}
      </div>

      {/* Thinking indicator */}
      {isLoading && (
        <div style={{ borderTop: '1px solid hsl(var(--border) / 0.3)' }}>
          <PersonaChatThinking persona={persona} />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
