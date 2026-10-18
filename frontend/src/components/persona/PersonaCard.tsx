import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InlineEditor, ArrayEditor } from './InlineEditor';
import type { Persona } from '@/types';
import { cn } from '@/lib/utils';
import {
  MoreHorizontal,
  Download,
  Copy,
  Trash2,
  User,
  MapPin,
  GraduationCap,
  Briefcase,
  Zap,
  Target,
  AlertTriangle,
  Brain,
  Users,
  Search,
  FileText
} from 'lucide-react';

interface PersonaCardProps {
  persona: Persona;
  onUpdate: (id: string, updates: Partial<Persona>) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (persona: Persona) => void;
  isEditable?: boolean;
  className?: string;
}

/**
 * `MainAppView.convertPersona` already normalises backend shapes to `string[]`, but a persisted
 * store can still hold objects written by an older build — so coerce defensively at the boundary.
 */
function toTextList(values: readonly unknown[], key: string): string[] {
  return values.flatMap(item => {
    if (typeof item === 'string') return item ? [item] : [];
    if (item && typeof item === 'object') {
      const text = Object.entries(item).find(([field]) => field === key)?.[1];
      return typeof text === 'string' && text ? [text] : [];
    }
    return [];
  });
}

export function PersonaCard({
  persona,
  onUpdate,
  onDelete,
  onDuplicate,
  isEditable = true,
  className
}: PersonaCardProps) {
  const [showActions, setShowActions] = useState(false);

  const handleUpdate = (patch: Partial<Persona>) => {
    onUpdate(String(persona.id), patch);
  };

  const handleDemographicsUpdate = (field: keyof Persona['demographics'], value: string) => {
    onUpdate(String(persona.id), {
      demographics: { ...persona.demographics, [field]: value }
    });
  };

  const handleExport = () => {
    // Future implementation for PDF export
    console.log('Export persona:', persona.id);
  };

  const handleCopy = () => {
    onDuplicate?.(persona);
  };

  // One tinted pattern for every chip: token text on a 10% wash of itself, so the label
  // stays legible in both themes without a separate text-only token.
  const techComfortColors = {
    low: 'border-destructive/40 bg-destructive/10 text-destructive',
    medium: 'border-signal-mood/40 bg-signal-mood/10 text-signal-mood',
    high: 'border-signal-goal/40 bg-signal-goal/10 text-signal-goal'
  };

  const statusColors = {
    primary: 'border-l-status-primary bg-status-primary/5',
    secondary: 'border-l-status-secondary bg-status-secondary/5'
  };

  return (
    <Card className={cn(
      "relative min-w-0 overflow-hidden border-l-4",
      statusColors[persona.status],
      className
    )}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start gap-2">
              <InlineEditor
                value={persona.name}
                onSave={(value) => handleUpdate({ name: value })}
                disabled={!isEditable}
                className="min-w-0 flex-1"
                displayClassName="break-words text-xl font-semibold [overflow-wrap:anywhere]"
                placeholder="Persona Name"
              />
              <span className={cn(
                "shrink-0 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em]",
                persona.status === 'primary'
                  ? 'border-status-primary/40 bg-status-primary/10 text-status-primary'
                  : 'border-status-secondary/40 bg-status-secondary/10 text-status-secondary'
              )}>
                {persona.status}
              </span>
            </div>
            <InlineEditor
              value={persona.role}
              onSave={(value) => handleUpdate({ role: value })}
              disabled={!isEditable}
              displayClassName="break-words text-muted-foreground [overflow-wrap:anywhere]"
              placeholder="Role/Position"
            />
          </div>

          {isEditable && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Persona actions"
                onClick={() => setShowActions(!showActions)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>

              {showActions && (
                <div className="absolute right-0 top-full z-[90] mt-1 min-w-[160px] border-2 border-border bg-popover py-1 text-popover-foreground shadow-[5px_5px_0_hsl(var(--foreground)/0.8)]">
                  <button
                    onClick={handleExport}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Download className="h-4 w-4" />
                    Export PDF
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => onDelete(String(persona.id))}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Demographics */}
        <div>
          <h3 className="persona-section-label">
            <User className="h-4 w-4" />
            Demographics
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Age</label>
              <div className="mt-1 flex items-center gap-1">
                <InlineEditor
                  value={persona.demographics.age}
                  onSave={(value) => handleDemographicsUpdate('age', value)}
                  disabled={!isEditable}
                  placeholder="Age"
                />
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Location</label>
              <div className="mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <InlineEditor
                  value={persona.demographics.location}
                  onSave={(value) => handleDemographicsUpdate('location', value)}
                  disabled={!isEditable}
                  placeholder="Location"
                />
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Education</label>
              <div className="mt-1 flex items-center gap-1">
                <GraduationCap className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <InlineEditor
                  value={persona.demographics.education}
                  onSave={(value) => handleDemographicsUpdate('education', value)}
                  disabled={!isEditable}
                  placeholder="Education"
                />
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Industry</label>
              <div className="mt-1 flex items-center gap-1">
                <Briefcase className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <InlineEditor
                  value={persona.demographics.industry}
                  onSave={(value) => handleDemographicsUpdate('industry', value)}
                  disabled={!isEditable}
                  placeholder="Industry"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tech Comfort */}
        <div>
          <h3 className="persona-section-label">
            <Zap className="h-4 w-4" />
            Tech Comfort Level
          </h3>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => isEditable && handleUpdate({ tech_comfort: level })}
                disabled={!isEditable}
                className={cn(
                  "border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors",
                  persona.tech_comfort === level
                    ? techComfortColors[level]
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  !isEditable && "cursor-default"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Goals */}
        <div>
          <h3 className="persona-section-label">
            <Target className="h-4 w-4" />
            Goals
          </h3>
          <ArrayEditor
            values={toTextList(persona.goals, 'goal_text')}
            onUpdate={(values) => handleUpdate({ goals: values })}
            placeholder="Add goal"
            disabled={!isEditable}
          />
        </div>

        {/* Frustrations */}
        <div>
          <h3 className="persona-section-label">
            <AlertTriangle className="h-4 w-4" />
            Frustrations
          </h3>
          <ArrayEditor
            values={toTextList(persona.frustrations, 'frustration_text')}
            onUpdate={(values) => handleUpdate({ frustrations: values })}
            placeholder="Add frustration"
            disabled={!isEditable}
          />
        </div>

        {/* Behavioral Patterns */}
        <div>
          <h3 className="persona-section-label">
            <Brain className="h-4 w-4" />
            Behavioral Patterns
          </h3>
          <ArrayEditor
            values={toTextList(persona.behavioral_patterns, 'pattern_text')}
            onUpdate={(values) => handleUpdate({ behavioral_patterns: values })}
            placeholder="Add behavioral pattern"
            disabled={!isEditable}
          />
        </div>

        {/* Scenario Context */}
        <div>
          <h3 className="persona-section-label">
            <FileText className="h-4 w-4" />
            Scenario Context
          </h3>
          <InlineEditor
            value={persona.scenario_context}
            onSave={(value) => handleUpdate({ scenario_context: value })}
            disabled={!isEditable}
            multiline
            placeholder="Describe the scenario context"
            displayClassName="text-sm text-muted-foreground"
          />
        </div>

        {/* Influence Networks */}
        <div>
          <h3 className="persona-section-label">
            <Users className="h-4 w-4" />
            Influence Networks
          </h3>
          <ArrayEditor
            values={toTextList(persona.influence_networks, 'network_text')}
            onUpdate={(values) => handleUpdate({ influence_networks: values })}
            placeholder="Add influence network"
            disabled={!isEditable}
          />
        </div>

        {/* Research Criteria */}
        <div>
          <h3 className="persona-section-label">
            <Search className="h-4 w-4" />
            Recruitment Criteria
          </h3>
          <ArrayEditor
            values={toTextList(persona.recruitment_criteria, 'criteria_text')}
            onUpdate={(values) => handleUpdate({ recruitment_criteria: values })}
            placeholder="Add recruitment criteria"
            disabled={!isEditable}
          />
        </div>

        {/* Research Assumptions */}
        <div>
          <h3 className="persona-section-label">
            <Brain className="h-4 w-4" />
            Research Assumptions
          </h3>
          <ArrayEditor
            values={toTextList(persona.research_assumptions, 'assumption_text')}
            onUpdate={(values) => handleUpdate({ research_assumptions: values })}
            placeholder="Add research assumption"
            disabled={!isEditable}
          />
        </div>
      </CardContent>

      {/* Click outside handler for actions menu */}
      {showActions && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowActions(false)}
        />
      )}
    </Card>
  );
}
