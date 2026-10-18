import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PersonaChatMessage as Msg, TagType } from '@/types/chat';

type Tone = 'muted' | 'context' | 'alert' | 'mood' | 'goal';

/** One tone per mood, resolved to literal utility classes so Tailwind can see them. */
const MOOD_TONES: Record<string, Tone> = {
  deadpan: 'muted',
  thoughtful: 'muted',
  neutral: 'muted',
  'matter-of-fact': 'context',
  frustrated: 'alert',
  skeptical: 'alert',
  blunt: 'alert',
  dry: 'mood',
  curious: 'goal',
  driven: 'goal',
  enthused: 'goal',
  thinking: 'mood',
};

const TONE_TEXT: Record<Tone, string> = {
  muted: 'text-muted-foreground',
  context: 'text-signal-context',
  alert: 'text-destructive',
  mood: 'text-signal-mood',
  goal: 'text-signal-goal',
};

const TONE_BORDER: Record<Tone, string> = {
  muted: 'border-muted-foreground',
  context: 'border-signal-context',
  alert: 'border-destructive',
  mood: 'border-signal-mood',
  goal: 'border-signal-goal',
};

const TAG_LABELS: Record<TagType, string> = {
  insight: 'Insight',
  friction: 'Friction',
  quote: 'Quote',
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
      <div className="flex flex-col items-end gap-1 bg-background px-4 py-3">
        <div
          className={cn(
            'max-w-[70%] border px-4 py-2.5 text-sm',
            message.failed
              ? 'border-destructive bg-muted text-muted-foreground'
              : 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {message.content}
        </div>
        {message.failed && (
          <div className="flex max-w-[70%] items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-destructive">
              ✕ Generation failed
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 border-destructive px-2 text-[10px] text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => onRetry(message.id, message.content)}
              disabled={isLoading}
            >
              ↺ Retry
            </Button>
          </div>
        )}
      </div>
    );
  }

  const tone = MOOD_TONES[message.mood ?? 'neutral'] ?? 'muted';
  const tags = message.tags ?? [];

  return (
    <div className="bg-background px-4 py-3">
      {/* Mood header */}
      <div className={cn('mb-2 font-mono text-[11px] uppercase tracking-[0.15em]', TONE_TEXT[tone])}>
        [as {personaName} — {message.mood ?? 'neutral'}]
      </div>

      {/* Message body — the mood tone is the only accent, carried by the rule at its left. */}
      <div className={cn('mb-2 border-l-4 pl-3 text-sm leading-relaxed whitespace-pre-wrap', TONE_BORDER[tone])}>
        {message.content}
      </div>

      {/* Trait attribution */}
      {showTrait && message.trait && (
        <div className="mb-2 pl-3 font-mono text-[11px] text-muted-foreground">
          ↳ {message.trait.source_type} "{message.trait.text}"
        </div>
      )}

      {/* Tags + feedback row */}
      <div className="flex flex-wrap items-center gap-2 pl-3">
        {(['insight', 'friction', 'quote'] as TagType[]).map(tag => {
          const isActive = tags.includes(tag);
          const isHovered = hoveredTag === tag;
          return (
            <button
              key={tag}
              onClick={() => onToggleTag(message.id, tag)}
              onMouseEnter={() => setHoveredTag(tag)}
              onMouseLeave={() => setHoveredTag(null)}
              className={cn(
                'border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors',
                isActive
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
                  : isHovered
                    ? 'border-foreground/70 text-foreground'
                    : 'border-muted-foreground/40 text-muted-foreground',
              )}
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
                title={dir === 'up' ? 'Useful' : 'Not useful'}
                aria-pressed={isActive}
                className={cn(
                  'border px-2 py-0.5 font-mono text-xs transition-colors',
                  isActive
                    ? 'border-primary bg-primary font-semibold text-primary-foreground'
                    : isHovered
                      ? 'border-foreground/60 text-foreground'
                      : 'border-muted-foreground/30 text-muted-foreground',
                )}
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
