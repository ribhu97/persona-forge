import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { TraitAttribution } from '@/types/chat';
import type { Persona } from '@/types';
import { getFollowUpSuggestions } from './suggestions';

interface Props {
  persona: Persona;
  isLoading: boolean;
  lastTrait?: TraitAttribution;
  messageCount: number;
  onSend: (content: string) => void;
}

export function PersonaChatComposer({ persona, isLoading, lastTrait, messageCount, onSend }: Props) {
  const [value, setValue] = useState('');
  const [hoveredChip, setHoveredChip] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const followUps = messageCount >= 2 ? getFollowUpSuggestions(lastTrait) : [];

  return (
    <div className="shrink-0 border-t-2 border-border bg-card">
      {/* Follow-up chips */}
      {followUps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1">
          <span className="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
            ← Follow-up
          </span>
          {followUps.map((s, i) => (
            <button
              key={i}
              onClick={() => { setValue(s); textareaRef.current?.focus(); }}
              onMouseEnter={() => setHoveredChip(i)}
              onMouseLeave={() => setHoveredChip(null)}
              className={`border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                hoveredChip === i
                  ? 'border-signal-context text-signal-context'
                  : 'border-foreground/25 text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer field — same field language as the canvas composer. */}
      <div className="px-4 pt-2 pb-2">
        <div className="flex items-end border-2 border-foreground/60 bg-background transition-colors focus-within:border-primary">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={`Ask ${persona.name} anything…`}
            rows={3}
            maxLength={4000}
            className="flex-1 resize-none bg-transparent px-3 py-2 font-mono text-sm focus:outline-none disabled:opacity-50"
          />
          <Button
            size="sm"
            className="m-1.5 shrink-0"
            onClick={handleSubmit}
            disabled={isLoading || !value.trim()}
          >
            Send
          </Button>
        </div>
      </div>

      {/* Footer hints */}
      <div className="space-y-0.5 px-4 pb-3">
        <div className="font-mono text-[10px] text-muted-foreground/70">
          [I] Enter to send · Shift-Enter for newline · Responses simulated from {persona.name}'s profile
        </div>
        <div className="font-mono text-[10px] text-muted-foreground/70">
          ☝ Rate replies to improve generation
        </div>
      </div>
    </div>
  );
}
