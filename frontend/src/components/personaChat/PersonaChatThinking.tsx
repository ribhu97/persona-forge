import { useEffect, useState } from 'react';
import type { Persona } from '@/types';
import { getThinkingPhrases } from './suggestions';

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
      <div className="text-[11px] font-mono tracking-[0.15em] uppercase mb-1" style={{ color: '#d4a017' }}>
        [as {persona.name} — thinking]
      </div>
      <div className="text-sm italic" style={{ color: '#d4a017' }}>
        {phrases[phraseIdx]}<span className="animate-pulse">█</span>
      </div>
    </div>
  );
}
