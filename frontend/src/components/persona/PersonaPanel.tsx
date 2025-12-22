import { useState } from 'react';
import { PersonaCard } from './PersonaCard';
import { ExportDialog } from './ExportDialog';
import { Button } from '@/components/ui/button';
import type { Persona } from '@/types';
import { cn } from '@/lib/utils';
import { Download, Plus, Trash2, History, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PersonaPanelProps {
  personas: Persona[];
  onUpdatePersona: (id: string, updates: Partial<Persona>) => void;
  onDeletePersona: (id: string) => void;
  onDuplicatePersona?: (persona: Persona) => void;
  onClearAll?: () => void;
  isLoading?: boolean;
  isTransitioning?: boolean;
  className?: string;
  versions?: { id: string; timestamp: Date }[]; // Simplified interface or use PersonaVersion
  selectedVersionId?: string;
  onSelectVersion?: (id: string) => void;
}

export function PersonaPanel({
  personas,
  onUpdatePersona,
  onDeletePersona,
  onDuplicatePersona,
  onClearAll,
  isLoading = false,
  isTransitioning = false,
  className,
  versions,
  selectedVersionId,
  onSelectVersion
}: PersonaPanelProps) {
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  const primaryPersonas = personas.filter(p => p.status === 'primary');
  const secondaryPersonas = personas.filter(p => p.status === 'secondary');

  if (isLoading) {
    return (
      <div className={cn("p-6 space-y-6", className)}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Generating Personas...</h2>
        </div>

        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="border rounded-xl p-6 animate-pulse"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-6 bg-muted rounded w-32" />
                  <div className="h-4 bg-muted rounded w-16" />
                </div>
                <div className="h-4 bg-muted rounded w-48" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-16 bg-muted rounded" />
                  <div className="h-16 bg-muted rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <div className={cn("p-6", className)}>
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No personas yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Enter a product description in the search panel to generate detailed user personas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("p-6 space-y-6 min-h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300 ease-out mt-8">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            Generated Personas ({personas.length})
          </h2>
          <p className="text-sm text-muted-foreground font-medium mt-1">
            {primaryPersonas.length} primary, {secondaryPersonas.length} secondary
          </p>
        </div>

        <div className="flex items-center gap-3">
          {versions && versions.length > 1 && onSelectVersion && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 font-medium">
                  <History className="h-4 w-4" />
                  v{versions.findIndex(v => v.id === selectedVersionId) + 1}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {versions.map((v, i) => (
                  <DropdownMenuItem
                    key={v.id}
                    onClick={() => onSelectVersion(v.id)}
                    className={cn(v.id === selectedVersionId && "bg-accent", "cursor-pointer")}
                  >
                    <span className="flex-1 font-medium">Version {i + 1}</span>
                    <span className="text-xs text-muted-foreground ml-3">
                      {v.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {personas.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsExportDialogOpen(true)}
                    className="flex items-center gap-2 transition-all duration-200 ease-out font-medium rounded-lg"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export Personas</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearAll}
                  disabled={isTransitioning}
                  className="flex items-center gap-2 transition-all duration-200 ease-out hover:bg-red-50 hover:text-red-600 hover:border-red-200 font-medium rounded-lg"
                >
                  {isTransitioning ? (
                    <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>New Chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onClearAll && personas.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClearAll}
                    disabled={isTransitioning}
                    className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 transition-all duration-200 ease-out font-medium rounded-lg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Clear Personas</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Primary Personas */}
      {primaryPersonas.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-3">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            Primary Personas ({primaryPersonas.length})
          </h3>
          <div className="space-y-4">
            {primaryPersonas.map((persona) => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                onUpdate={onUpdatePersona}
                onDelete={onDeletePersona}
                onDuplicate={onDuplicatePersona}
              />
            ))}
          </div>
        </div>
      )}

      {/* Secondary Personas */}
      {secondaryPersonas.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-3">
            <div className="w-3 h-3 bg-purple-500 rounded-full" />
            Secondary Personas ({secondaryPersonas.length})
          </h3>
          <div className="space-y-4">
            {secondaryPersonas.map((persona) => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                onUpdate={onUpdatePersona}
                onDelete={onDeletePersona}
                onDuplicate={onDuplicatePersona}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-8 p-5 bg-muted/50 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-400 ease-out">
        <h4 className="font-semibold text-sm mb-3 text-foreground">💡 Tips</h4>
        <ul className="text-sm text-muted-foreground space-y-2 font-medium">
          <li>• Click any field to edit inline</li>
          <li>• Use the ⋯ menu to export, duplicate, or delete personas</li>
          <li>• Primary personas are your main target users</li>
          <li>• Secondary personas are edge cases or alternative user types</li>
        </ul>
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        personas={personas}
      />
    </div>
  );
}