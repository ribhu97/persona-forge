import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  User, MapPin, GraduationCap, Briefcase, Zap,
  Target, AlertTriangle, Brain, Users, FileText, Search,
  ChevronRight, ChevronLeft,
} from 'lucide-react';
import type { Persona } from '@/types';
import type { PersonaChatMessage } from '@/types/chat';

interface Props {
  persona: Persona;
  messages: PersonaChatMessage[];
  showTrait: boolean;
  onToggleTrait: () => void;
}

/**
 * Mirrors PersonaCard's sections in the same order and with the same labels, so the chat's rail
 * and the canvas details panel present one persona rather than two different summaries.
 */
function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <p className="text-sm italic text-muted-foreground">None</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed">
          <span className="text-muted-foreground">·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PersonaChatRail({ persona, messages, showTrait, onToggleTrait }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const thumbsUp = messages.filter(m => m.role === 'persona' && m.feedback === 'up').length;
  const thumbsDown = messages.filter(m => m.role === 'persona' && m.feedback === 'down').length;

  const initials = persona.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  if (collapsed) {
    return (
      <div className="relative flex w-[52px] flex-col items-center border-l-2 border-border bg-card">
        <Button
          variant="ghost"
          size="icon"
          className="mt-4 h-8 w-8"
          onClick={() => setCollapsed(false)}
          aria-label="Expand profile"
          title="Expand profile"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className={cn(
          'mt-3 flex h-9 w-9 items-center justify-center border-2 text-sm font-semibold',
          persona.status === 'primary'
            ? 'border-status-primary bg-status-primary/10 text-status-primary'
            : 'border-status-secondary bg-status-secondary/10 text-status-secondary'
        )}>
          {initials}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-[340px] min-w-[340px] flex-col overflow-hidden border-l-2 border-border bg-card">
      {/* Header row */}
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center border-2 text-sm font-semibold',
            persona.status === 'primary'
              ? 'border-status-primary bg-status-primary/10 text-status-primary'
              : 'border-status-secondary bg-status-secondary/10 text-status-secondary'
          )}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{persona.name}</p>
            <p className="truncate text-xs text-muted-foreground">{persona.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse profile"
          title="Collapse profile"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Status + tech comfort pills */}
      <div className="flex shrink-0 flex-wrap gap-2 px-4 pb-3">
        <span className={cn(
          'border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]',
          persona.status === 'primary'
            ? 'border-status-primary/40 bg-status-primary/10 text-status-primary'
            : 'border-status-secondary/40 bg-status-secondary/10 text-status-secondary'
        )}>
          {persona.status}
        </span>
        <span className="border border-border bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {persona.tech_comfort} tech
        </span>
      </div>

      {/* Scrollable body — same sections, same order, same labels as PersonaCard. */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
        <div>
          <h3 className="persona-section-label">
            <User className="h-4 w-4" />
            Demographics
          </h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {[
              { icon: User, label: 'Age', value: persona.demographics?.age },
              { icon: MapPin, label: 'Location', value: persona.demographics?.location },
              { icon: GraduationCap, label: 'Education', value: persona.demographics?.education },
              { icon: Briefcase, label: 'Industry', value: persona.demographics?.industry },
            ].map(({ icon: Icon, label, value }) => value ? (
              <div key={label}>
                <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</label>
                <div className="mt-0.5 flex items-center gap-1">
                  <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{value}</span>
                </div>
              </div>
            ) : null)}
          </div>
        </div>

        <div>
          <h3 className="persona-section-label">
            <Zap className="h-4 w-4" />
            Tech Comfort Level
          </h3>
          <span className="border border-border bg-muted px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {persona.tech_comfort}
          </span>
        </div>

        {persona.goals?.length > 0 && (
          <div>
            <h3 className="persona-section-label">
              <Target className="h-4 w-4" />
              Goals
            </h3>
            <BulletList items={persona.goals} />
          </div>
        )}

        {persona.frustrations?.length > 0 && (
          <div>
            <h3 className="persona-section-label">
              <AlertTriangle className="h-4 w-4" />
              Frustrations
            </h3>
            <BulletList items={persona.frustrations} />
          </div>
        )}

        {persona.behavioral_patterns?.length > 0 && (
          <div>
            <h3 className="persona-section-label">
              <Brain className="h-4 w-4" />
              Behavioral Patterns
            </h3>
            <BulletList items={persona.behavioral_patterns} />
          </div>
        )}

        {persona.scenario_context && (
          <div>
            <h3 className="persona-section-label">
              <FileText className="h-4 w-4" />
              Scenario Context
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{persona.scenario_context}</p>
          </div>
        )}

        {persona.influence_networks?.length > 0 && (
          <div>
            <h3 className="persona-section-label">
              <Users className="h-4 w-4" />
              Influence Networks
            </h3>
            <BulletList items={persona.influence_networks} />
          </div>
        )}

        {persona.recruitment_criteria?.length > 0 && (
          <div>
            <h3 className="persona-section-label">
              <Search className="h-4 w-4" />
              Recruitment Criteria
            </h3>
            <BulletList items={persona.recruitment_criteria} />
          </div>
        )}

        {persona.research_assumptions?.length > 0 && (
          <div>
            <h3 className="persona-section-label">
              <Brain className="h-4 w-4" />
              Research Assumptions
            </h3>
            <BulletList items={persona.research_assumptions} />
          </div>
        )}

        {/* Session signals */}
        {messages.length > 0 && (
          <div className="border-t border-border pt-3">
            <h3 className="persona-section-label">
              <Zap className="h-4 w-4" />
              Session Signals
            </h3>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>↑ {thumbsUp} useful</span>
              <span>↓ {thumbsDown} not useful</span>
            </div>
          </div>
        )}

        {/* Trait toggle */}
        <div className="border-t border-border pt-3">
          <button
            onClick={onToggleTrait}
            aria-pressed={showTrait}
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className={cn('h-3 w-3 shrink-0 border-2', showTrait ? 'border-primary bg-primary' : 'border-muted-foreground')} />
            {showTrait ? 'Hide trait attribution' : 'Show trait attribution'}
          </button>
        </div>
      </div>
    </div>
  );
}
