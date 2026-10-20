import type { Persona } from '@/types';
import { getThinkingPhrases } from './suggestions';
import { useEffect, useState } from 'react';

interface Props {
  persona: Persona;
}

export function PersonaChatThinking({ persona }: Props) {
  const phrases = getThinkingPhrases(persona);
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIdx(i => (i + 1) % phrases.length);
    }, 2500);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <div className="px-4 py-3">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.15em] text-signal-mood">
        [as {persona.name} — thinking]
      </div>
      <div className="text-sm italic text-signal-mood">
        {phrases[phraseIdx]}<span className="animate-pulse">█</span>
      </div>
    </div>
  );
}
