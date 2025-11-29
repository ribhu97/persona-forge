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
  FileText,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

interface PersonaCardProps {
  persona: Persona;
  onUpdate: (id: string, updates: Partial<Persona>) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (persona: Persona) => void;
  isEditable?: boolean;
  className?: string;
}

export function PersonaCard({
  persona,
  onUpdate,
  onDelete,
  onDuplicate,
  isEditable = true,
  className
}: PersonaCardProps) {
  // Debug log
  // console.log('PersonaCard render:', persona.id, 'goals:', persona.goals);

  const [showActions, setShowActions] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const sanitizeArray = (arr: any[], key: string) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        // @ts-ignore
        const val = item[key];
        if (val !== undefined && val !== null) {
          return String(val);
        }
        // Try to find any string property if key fails?
        // For now just return empty string to prevent crash
        return '';
      }
      return String(item);
    });
  };

  const handleUpdate = (field: keyof Persona, value: any) => {
    onUpdate(String(persona.id), { [field]: value });
  };

  const handleDemographicsUpdate = (field: keyof Persona['demographics'], value: string) => {
    onUpdate(String(persona.id), {
      demographics: {
        ...persona.demographics,
        [field]: value
      }
    });
  };

  const handleExport = () => {
    // Future implementation for PDF export
    console.log('Export persona:', persona.id);
  };

  const handleCopy = () => {
    onDuplicate?.(persona);
  };

  const techComfortColors = {
    low: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    high: 'bg-green-100 text-green-800 border-green-200'
  };

  const statusColors = {
    primary: 'border-l-blue-500 bg-blue-50/50',
    secondary: 'border-l-purple-500 bg-purple-50/50'
  };

  return (
    <Card className={cn(
      "relative transition-all duration-200 hover:shadow-md",
      "border-l-4",
      statusColors[persona.status],
      isCollapsed && "bg-muted/30",
      className
    )}>
      <CardHeader className={cn("pb-4", isCollapsed && "pb-3")}>
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleCollapse}
                className="h-6 w-6 p-0 hover:bg-muted/50 transition-all duration-200 ease-out"
                title={isCollapsed ? "Expand persona" : "Collapse persona"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <InlineEditor
                value={persona.name}
                onSave={(value) => handleUpdate('name', value)}
                disabled={!isEditable}
                displayClassName={cn(
                  "text-xl font-semibold",
                  isCollapsed && "text-lg"
                )}
                placeholder="Persona Name"
              />
              <span className={cn(
                "text-xs px-2 py-1 rounded-full border font-medium capitalize",
                persona.status === 'primary' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-purple-100 text-purple-700 border-purple-200'
              )}>
                {persona.status}
              </span>
            </div>
            {!isCollapsed && (
              <InlineEditor
                value={persona.role}
                onSave={(value) => handleUpdate('role', value)}
                disabled={!isEditable}
                displayClassName="text-muted-foreground"
                placeholder="Role/Position"
              />
            )}
            {isCollapsed && (
              <div className="text-sm text-muted-foreground mt-1">
                {persona.role || "No role specified"}
              </div>
            )}
          </div>

          {isEditable && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowActions(!showActions)}
                className="h-8 w-8"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>

              {showActions && (
                <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg z-10 min-w-[160px]">
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Export PDF
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={() => onDelete(String(persona.id))}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-red-50 hover:text-red-700 transition-colors"
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

      {!isCollapsed && (
        <CardContent className="space-y-6">
          {/* Demographics */}
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Demographics
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="text-muted-foreground text-xs">Age</label>
                <div className="flex items-center gap-1 mt-1">
                  <InlineEditor
                    value={persona.demographics.age}
                    onSave={(value) => handleDemographicsUpdate('age', value)}
                    disabled={!isEditable}
                    placeholder="Age"
                  />
                </div>
              </div>
              <div>
                <label className="text-muted-foreground text-xs">Location</label>
                <div className="flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <InlineEditor
                    value={persona.demographics.location}
                    onSave={(value) => handleDemographicsUpdate('location', value)}
                    disabled={!isEditable}
                    placeholder="Location"
                  />
                </div>
              </div>
              <div>
                <label className="text-muted-foreground text-xs">Education</label>
                <div className="flex items-center gap-1 mt-1">
                  <GraduationCap className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <InlineEditor
                    value={persona.demographics.education}
                    onSave={(value) => handleDemographicsUpdate('education', value)}
                    disabled={!isEditable}
                    placeholder="Education"
                  />
                </div>
              </div>
              <div>
                <label className="text-muted-foreground text-xs">Industry</label>
                <div className="flex items-center gap-1 mt-1">
                  <Briefcase className="h-3 w-3 text-muted-foreground flex-shrink-0" />
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
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Tech Comfort Level
            </h3>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => isEditable && handleUpdate('tech_comfort', level)}
                  disabled={!isEditable}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border transition-colors capitalize",
                    persona.tech_comfort === level
                      ? techComfortColors[level]
                      : "bg-background hover:bg-accent",
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
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Goals
            </h3>
            <ArrayEditor
              values={sanitizeArray(persona.goals, 'goal_text')}
              onUpdate={(values) => handleUpdate('goals', values)}
              placeholder="Add goal"
              disabled={!isEditable}
            />
          </div>

          {/* Frustrations */}
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Frustrations
            </h3>
            <ArrayEditor
              values={sanitizeArray(persona.frustrations, 'frustration_text')}
              onUpdate={(values) => handleUpdate('frustrations', values)}
              placeholder="Add frustration"
              disabled={!isEditable}
            />
          </div>

          {/* Behavioral Patterns */}
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Behavioral Patterns
            </h3>
            <ArrayEditor
              values={sanitizeArray(persona.behavioral_patterns, 'pattern_text')}
              onUpdate={(values) => handleUpdate('behavioral_patterns', values)}
              placeholder="Add behavioral pattern"
              disabled={!isEditable}
            />
          </div>

          {/* Scenario Context */}
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Scenario Context
            </h3>
            <InlineEditor
              value={persona.scenario_context}
              onSave={(value) => handleUpdate('scenario_context', value)}
              disabled={!isEditable}
              multiline
              placeholder="Describe the scenario context"
              displayClassName="text-sm text-muted-foreground"
            />
          </div>

          {/* Influence Networks */}
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Influence Networks
            </h3>
            <ArrayEditor
              values={sanitizeArray(persona.influence_networks, 'network_text')}
              onUpdate={(values) => handleUpdate('influence_networks', values)}
              placeholder="Add influence network"
              disabled={!isEditable}
            />
          </div>

          {/* Research Criteria */}
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Search className="h-4 w-4" />
              Recruitment Criteria
            </h3>
            <ArrayEditor
              values={sanitizeArray(persona.recruitment_criteria, 'criteria_text')}
              onUpdate={(values) => handleUpdate('recruitment_criteria', values)}
              placeholder="Add recruitment criteria"
              disabled={!isEditable}
            />
          </div>

          {/* Research Assumptions */}
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Research Assumptions
            </h3>
            <ArrayEditor
              values={sanitizeArray(persona.research_assumptions, 'assumption_text')}
              onUpdate={(values) => handleUpdate('research_assumptions', values)}
              placeholder="Add research assumption"
              disabled={!isEditable}
            />
          </div>
        </CardContent>
      )}

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