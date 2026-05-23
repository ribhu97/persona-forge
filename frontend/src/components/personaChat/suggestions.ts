import type { Persona } from '@/types';
import type { TraitAttribution } from '@/types/chat';

export interface Suggestion {
  text: string;
  type: 'friction' | 'goal';
  source: string;
}

export function getInitialSuggestions(persona: Persona): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const frustrations = Array.isArray(persona.frustrations) ? persona.frustrations : [];
  const goals = Array.isArray(persona.goals) ? persona.goals : [];

  for (const f of frustrations.slice(0, 2)) {
    if (f) {
      suggestions.push({
        text: `Tell me about a recent time you ran into this problem: "${truncate(f, 60)}"`,
        type: 'friction',
        source: f,
      });
    }
  }

  for (const g of goals.slice(0, 2)) {
    if (g) {
      suggestions.push({
        text: `How are you working toward this goal today: "${truncate(g, 60)}"`,
        type: 'goal',
        source: g,
      });
    }
  }

  if (suggestions.length === 0) {
    suggestions.push(
      { text: `Walk me through a typical day in your role.`, type: 'goal', source: '' },
      { text: `What's the biggest challenge you're facing right now?`, type: 'friction', source: '' },
    );
  }

  return suggestions;
}

export function getFollowUpSuggestions(lastTrait: TraitAttribution | undefined): string[] {
  if (!lastTrait) {
    return ["Can you give me a specific example?"];
  }

  switch (lastTrait.source_type) {
    case 'DEMOGRAPHICS':
      return [
        "How does that background shape how you approach this day-to-day?",
        "Has that changed how you evaluate tools or processes?",
      ];
    case 'SCENARIO_CONTEXT':
      return [
        "How often does this situation come up?",
        "What do you do differently when it happens?",
      ];
    default:
      return ["Can you give me a specific example?", "What would change your mind on this?"];
  }
}

export function getThinkingPhrases(persona: Persona): string[] {
  const role = (persona.role || '').toLowerCase();
  const industry = (persona.demographics?.industry || '').toLowerCase();

  if (role.includes('engineer') || role.includes('developer') || role.includes('tech')) {
    return [
      "running a quick mental diff on that…",
      "checking my assumptions…",
      "thinking through the edge cases…",
      "let me recall…",
    ];
  }
  if (role.includes('design') || role.includes('product') || role.includes('ux')) {
    return [
      "mapping this to my experience…",
      "thinking about the last time I dealt with this…",
      "running through a few scenarios…",
      "let me think…",
    ];
  }
  if (industry.includes('finance') || industry.includes('bank')) {
    return [
      "weighing the risk here…",
      "cross-referencing what I know…",
      "thinking through the implications…",
      "let me consider this carefully…",
    ];
  }
  return [
    "thinking about this…",
    "let me recall…",
    "checking my notes…",
    "give me a moment…",
  ];
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
