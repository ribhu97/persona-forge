import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  User, MapPin, GraduationCap, Briefcase, Zap,
  Target, AlertTriangle, Brain, Users, FileText,
  ChevronRight, ChevronLeft, ChevronDown,
} from 'lucide-react';
import type { Persona } from '@/types';
import type { PersonaChatMessage } from '@/types/chat';

interface Props {
  persona: Persona;
  messages: PersonaChatMessage[];
  showTrait: boolean;
  onToggleTrait: () => void;
}

const techComfortColors = {
  low: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-green-100 text-green-800 border-green-200',
};

const statusColors = {
  primary: 'bg-blue-100 text-blue-700 border-blue-200',
  secondary: 'bg-purple-100 text-purple-700 border-purple-200',
};

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
      <Icon className="h-4 w-4" />
      {label}
    </h3>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground italic">None</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-muted-foreground flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

interface CollapsibleSectionProps {
  icon: React.ElementType;
  label: string;
  color: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ icon: Icon, label, color, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-0.5 mb-1"
      >
        <span className="flex items-center gap-2" style={{ color }}>
          <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
          <span className="font-mono tracking-[0.1em] uppercase text-[11px] font-medium">{label}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="pb-1">{children}</div>
      </div>
    </div>
  );
}

export function PersonaChatRail({ persona, messages, showTrait, onToggleTrait }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const thumbsUp = messages.filter(m => m.role === 'persona' && m.feedback === 'up').length;
  const thumbsDown = messages.filter(m => m.role === 'persona' && m.feedback === 'down').length;

  const initials = persona.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  if (collapsed) {
    return (
      <div className="relative flex flex-col items-center border-l border-border" style={{ width: 52, background: 'hsl(var(--background))' }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          className="mt-4 h-8 w-8"
          title="Expand profile"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className={cn(
          "mt-3 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2",
          persona.status === 'primary' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-purple-400 bg-purple-50 text-purple-700'
        )}>
          {initials}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-l border-border overflow-hidden" style={{ width: 340, minWidth: 340, background: 'hsl(var(--background))' }}>
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 shrink-0",
            persona.status === 'primary' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-purple-400 bg-purple-50 text-purple-700'
          )}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-base truncate">{persona.name}</p>
            <p className="text-xs text-muted-foreground truncate">{persona.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(true)}
          className="h-7 w-7 shrink-0 transition-colors duration-150"
          title="Collapse profile"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Status + tech comfort pills */}
      <div className="flex gap-2 px-4 pb-3 shrink-0 flex-wrap">
        <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium capitalize", statusColors[persona.status])}>
          {persona.status}
        </span>
        <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium capitalize", techComfortColors[persona.tech_comfort])}>
          {persona.tech_comfort} tech
        </span>
      </div>

      {/* Scrollable body — mirrors PersonaCard sections */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">

        {/* Demographics */}
        <div>
          <SectionLabel icon={User} label="Demographics" />
          <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-sm">
            {[
              { icon: User, label: 'Age', value: persona.demographics?.age },
              { icon: MapPin, label: 'Location', value: persona.demographics?.location },
              { icon: GraduationCap, label: 'Education', value: persona.demographics?.education },
              { icon: Briefcase, label: 'Industry', value: persona.demographics?.industry },
            ].map(({ icon: Icon, label, value }) => value ? (
              <div key={label}>
                <label className="text-muted-foreground text-xs font-mono tracking-widest uppercase">{label}</label>
                <div className="flex items-center gap-1 mt-0.5">
                  <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{value}</span>
                </div>
              </div>
            ) : null)}
          </div>
        </div>

        {/* Goals */}
        {persona.goals?.length > 0 && (
          <CollapsibleSection icon={Target} label="Goals" color="#4a7c59">
            <BulletList items={persona.goals} />
          </CollapsibleSection>
        )}

        {/* Frustrations */}
        {persona.frustrations?.length > 0 && (
          <CollapsibleSection icon={AlertTriangle} label="Frustrations" color="#c0392b">
            <BulletList items={persona.frustrations} />
          </CollapsibleSection>
        )}

        {/* Behavioral Patterns */}
        {persona.behavioral_patterns?.length > 0 && (
          <CollapsibleSection icon={Brain} label="Behavioural Patterns" color="#1a4a7a">
            <BulletList items={persona.behavioral_patterns} />
          </CollapsibleSection>
        )}

        {/* Scenario Context */}
        {persona.scenario_context && (
          <CollapsibleSection icon={FileText} label="Scenario Context" color="hsl(var(--muted-foreground))">
            <p className="text-sm text-muted-foreground leading-relaxed">{persona.scenario_context}</p>
          </CollapsibleSection>
        )}

        {/* Influence Networks */}
        {persona.influence_networks?.length > 0 && (
          <CollapsibleSection icon={Users} label="Influence Networks" color="hsl(var(--muted-foreground))">
            <BulletList items={persona.influence_networks} />
          </CollapsibleSection>
        )}

        {/* Session signals divider */}
        {messages.length > 0 && (
          <div className="border-t border-border pt-3">
            <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
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
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            <span className={cn("w-3 h-3 rounded-full border-2 flex-shrink-0", showTrait ? "bg-primary border-primary" : "border-muted-foreground")} />
            {showTrait ? 'Hide trait attribution' : 'Show trait attribution'}
          </button>
        </div>
      </div>
    </div>
  );
}
