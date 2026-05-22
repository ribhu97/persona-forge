import { useState, useRef, useEffect, KeyboardEvent } from 'react';
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
    <div className="border-t border-border shrink-0" style={{ background: 'hsl(var(--background))' }}>
      {/* Follow-up chips */}
      {followUps.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 pt-3 pb-1">
          <span className="text-[10px] font-mono tracking-[0.12em] shrink-0 select-none" style={{ color: 'hsl(var(--muted-foreground) / 0.5)' }}>
            ← FOLLOW-UP
          </span>
          {followUps.map((s, i) => (
            <button
              key={i}
              onClick={() => { setValue(s); textareaRef.current?.focus(); }}
              onMouseEnter={() => setHoveredChip(i)}
              onMouseLeave={() => setHoveredChip(null)}
              className="text-[11px] font-mono tracking-[0.1em] px-3 py-1 transition-all duration-150"
              style={{
                borderRadius: 0,
                border: hoveredChip === i ? '2px solid #1a4a7a' : '1px solid hsl(var(--foreground) / 0.3)',
                color: hoveredChip === i ? '#1a4a7a' : 'inherit',
                background: 'hsl(var(--background))',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Unified input container */}
      <div className="px-4 pt-2 pb-2">
        <div
          className="flex items-end transition-colors duration-150"
          style={{
            borderRadius: 0,
            border: '1px solid hsl(var(--foreground) / 0.4)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={`Ask ${persona.name} anything…`}
            rows={3}
            maxLength={4000}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm font-mono focus:outline-none disabled:opacity-50"
            style={{ borderRadius: 0 }}
            onFocus={e => {
              const parent = e.currentTarget.parentElement;
              if (parent) parent.style.border = '1px solid hsl(var(--foreground))';
            }}
            onBlur={e => {
              const parent = e.currentTarget.parentElement;
              if (parent) parent.style.border = '1px solid hsl(var(--foreground) / 0.4)';
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading || !value.trim()}
            className="self-end m-1.5 px-3 py-1.5 text-[11px] font-mono tracking-[0.15em] uppercase disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shrink-0"
            style={{
              borderRadius: 0,
              border: '1px solid hsl(var(--foreground))',
              background: 'hsl(var(--foreground))',
              color: 'hsl(var(--background))',
            }}
            onMouseEnter={e => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.opacity = '0.8';
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ◈ SEND
          </button>
        </div>
      </div>

      {/* Footer hints */}
      <div className="px-4 pb-3 space-y-0.5">
        <div className="text-[10px] font-mono" style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>
          [I] ENTER TO SEND · SHIFT-ENTER FOR NEWLINE · RESPONSES SIMULATED FROM {persona.name.toUpperCase()}'S PROFILE
        </div>
        <div className="text-[10px] font-mono" style={{ color: 'hsl(var(--muted-foreground) / 0.5)' }}>
          ☝ RATE REPLIES TO IMPROVE GENERATION
        </div>
      </div>
    </div>
  );
}
