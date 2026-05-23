import { useState } from 'react';
import type { PersonaChatMessage as Msg, TagType } from '@/types/chat';

const MOOD_COLORS: Record<string, string> = {
  deadpan: 'hsl(var(--muted-foreground))',
  thoughtful: 'hsl(var(--muted-foreground))',
  neutral: 'hsl(var(--muted-foreground))',
  'matter-of-fact': '#1a4a7a',
  frustrated: '#c0392b',
  skeptical: '#c0392b',
  blunt: '#c0392b',
  dry: '#d4a017',
  curious: '#4a7c59',
  driven: '#4a7c59',
  enthused: '#27ae60',
  thinking: '#d4a017',
};

const TAG_LABELS: Record<TagType, string> = {
  insight: 'INSIGHT',
  friction: 'FRICTION',
  quote: 'QUOTE',
};

interface Props {
  message: Msg;
  personaName: string;
  showTrait: boolean;
  isLoading: boolean;
  onFeedback: (id: number, value: 'up' | 'down' | null) => void;
  onToggleTag: (id: number, tag: TagType) => void;
  onRetry: (id: number, content: string) => void;
}

export function PersonaChatMessageBubble({ message, personaName, showTrait, isLoading, onFeedback, onToggleTag, onRetry }: Props) {
  const [hoveredTag, setHoveredTag] = useState<TagType | null>(null);
  const [hoveredFb, setHoveredFb] = useState<'up' | 'down' | null>(null);

  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end px-4 py-2 gap-1" style={{ background: 'hsl(var(--background))' }}>
        <div
          className="max-w-[70%] px-4 py-3 text-sm"
          style={{
            background: message.failed ? 'hsl(var(--muted))' : 'hsl(var(--foreground))',
            color: message.failed ? 'hsl(var(--muted-foreground))' : 'hsl(var(--background))',
            fontFamily: 'var(--font-sans)',
            borderRadius: 0,
            border: message.failed ? '1px solid #c0392b' : 'none',
          }}
        >
          {message.content}
        </div>
        {message.failed && (
          <div className="flex items-center gap-2 max-w-[70%]">
            <span className="text-[10px] font-mono" style={{ color: '#c0392b' }}>
              ✕ GENERATION FAILED
            </span>
            <button
              onClick={() => onRetry(message.id, message.content)}
              disabled={isLoading}
              className="text-[10px] font-mono tracking-[0.12em] px-2 py-0.5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderRadius: 0,
                border: '1px solid #c0392b',
                color: '#c0392b',
                background: 'transparent',
              }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = '#c0392b'; e.currentTarget.style.color = 'hsl(var(--background))'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#c0392b'; }}
            >
              ↺ RETRY
            </button>
          </div>
        )}
      </div>
    );
  }

  const mood = message.mood ?? 'neutral';
  const moodColor = MOOD_COLORS[mood] ?? 'hsl(var(--muted-foreground))';
  const tags = message.tags ?? [];

  return (
    <div className="px-4 py-3" style={{ background: 'hsl(var(--background))' }}>
      {/* Mood header */}
      <div
        className="text-[11px] font-mono font-semibold tracking-[0.15em] uppercase mb-2"
        style={{ color: moodColor }}
      >
        [as {personaName} — {mood}]
      </div>

      {/* Message body */}
      <div
        className="text-sm whitespace-pre-wrap pl-3 mb-2"
        style={{
          borderLeft: `4px solid ${moodColor}`,
          fontFamily: 'var(--font-sans)',
          lineHeight: '1.6',
        }}
      >
        {message.content}
      </div>

      {/* Trait attribution */}
      {showTrait && message.trait && (
        <div className="text-[11px] font-mono mb-2 pl-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
          ↳ {message.trait.source_type} "{message.trait.text}"
        </div>
      )}

      {/* Tags + feedback row */}
      <div className="flex items-center gap-2 flex-wrap pl-3">
        {(['insight', 'friction', 'quote'] as TagType[]).map(tag => {
          const isActive = tags.includes(tag);
          const isHovered = hoveredTag === tag;
          return (
            <button
              key={tag}
              onClick={() => onToggleTag(message.id, tag)}
              onMouseEnter={() => setHoveredTag(tag)}
              onMouseLeave={() => setHoveredTag(null)}
              className="text-[10px] font-mono tracking-[0.12em] px-2 py-0.5 transition-all duration-150"
              style={{
                borderRadius: 0,
                border: isActive
                  ? '1px solid hsl(var(--foreground))'
                  : isHovered
                    ? '1px solid hsl(var(--foreground) / 0.7)'
                    : '1px solid hsl(var(--muted-foreground) / 0.4)',
                background: isActive ? 'hsl(var(--foreground))' : 'transparent',
                color: isActive ? 'hsl(var(--background))' : isHovered ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                fontWeight: isActive ? '600' : '400',
              }}
            >
              {isActive ? '✓ ' : ''}{TAG_LABELS[tag]}
            </button>
          );
        })}

        <div className="ml-auto flex gap-1">
          {(['up', 'down'] as const).map(dir => {
            const isActive = message.feedback === dir;
            const isHovered = hoveredFb === dir;
            return (
              <button
                key={dir}
                onClick={() => onFeedback(message.id, isActive ? null : dir)}
                onMouseEnter={() => setHoveredFb(dir)}
                onMouseLeave={() => setHoveredFb(null)}
                className="text-xs px-2 py-0.5 font-mono transition-all duration-150"
                title={dir === 'up' ? 'Useful' : 'Not useful'}
                style={{
                  borderRadius: 0,
                  border: isActive
                    ? '1px solid hsl(var(--foreground))'
                    : isHovered
                      ? '1px solid hsl(var(--foreground) / 0.6)'
                      : '1px solid hsl(var(--muted-foreground) / 0.3)',
                  background: isActive ? 'hsl(var(--foreground))' : 'transparent',
                  color: isActive ? 'hsl(var(--background))' : isHovered ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                  fontWeight: isActive ? '600' : '400',
                }}
              >
                {dir === 'up' ? '↑' : '↓'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
