import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThinkHardStage, ThinkHardProgress } from '@/types';

const STAGE_LABELS: Record<ThinkHardStage, string> = {
  queued: 'Queued', running: 'Starting', draft: 'Drafting personas',
  judge: 'Evaluating drafts', critique: 'Critiquing quality',
  revise: 'Revising', persisting: 'Saving results',
  succeeded: 'Complete', failed: 'Failed', timed_out: 'Timed out',
};

const STAGE_ORDER: ThinkHardStage[] = ['draft', 'judge', 'critique', 'revise', 'persisting'];

interface ThinkHardProgressProps {
  progress: ThinkHardProgress | null;
  className?: string;
}

export function ThinkHardProgressView({ progress, className }: ThinkHardProgressProps) {
  if (!progress) return null;
  const isRunning = !progress.isTerminal;
  const isError = progress.stage === 'failed' || progress.stage === 'timed_out';

  return (
    <div className={cn(
      "flex flex-col gap-3 p-4 rounded-lg border",
      isError ? "bg-red-50 border-red-200" : "bg-muted/30 border-border", className,
    )}>
      <div className="flex items-center gap-2">
        {isRunning && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
        {!isRunning && !isError && <Check className="w-4 h-4 text-green-600" />}
        {!isRunning && isError && <AlertTriangle className="w-4 h-4 text-red-600" />}
        <span className={cn("text-sm font-medium", isError ? "text-red-700" : "text-foreground")}>
          {STAGE_LABELS[progress.stage] || progress.stage}
        </span>
        {progress.stage === 'draft' && (
          <span className="text-xs text-muted-foreground">· 3 parallel drafts</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{progress.message}</p>
      {isRunning && (
        <div className="flex items-center gap-1 mt-1">
          {STAGE_ORDER.map((stage) => {
            const currentIdx = STAGE_ORDER.indexOf(progress.stage as ThinkHardStage);
            const stageIdx = STAGE_ORDER.indexOf(stage);
            return (
              <div key={stage} className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-300",
                stageIdx < currentIdx && "bg-green-500",
                stageIdx === currentIdx && "bg-primary animate-pulse",
                stageIdx > currentIdx && "bg-border",
              )} />
            );
          })}
        </div>
      )}
      {isError && progress.error && (
        <p className="text-xs text-red-600 mt-1">{progress.error}</p>
      )}
    </div>
  );
}

export function parseJobEvent(eventType: string, data: string): ThinkHardProgress {
  let payload: any = {};
  try { payload = JSON.parse(data); } catch { /* ignore */ }

  switch (eventType) {
    case 'state_changed':
      if (payload.state === 'queued')
        return { stage: 'queued', message: 'Waiting for worker...', isTerminal: false };
      if (payload.state === 'running')
        return { stage: 'running', message: 'Pipeline started', isTerminal: false };
      if (payload.state === 'persisting')
        return { stage: 'persisting', message: 'Saving personas to database', isTerminal: false };
      break;
    case 'stage_started':
      if (payload.stage === 'draft')
        return { stage: 'draft', message: `Generating ${payload.count || 3} drafts in parallel...`, isTerminal: false };
      if (payload.stage === 'judge')
        return { stage: 'judge', message: 'Selecting the best draft...', isTerminal: false };
      if (payload.stage === 'critique')
        return { stage: 'critique', message: 'Identifying quality issues...', isTerminal: false };
      if (payload.stage === 'revise')
        return { stage: 'revise', message: 'Applying fixes based on critique...', isTerminal: false };
      if (payload.stage === 'generate')
        return { stage: 'running', message: 'Generating personas...', isTerminal: false };
      break;
    case 'stage_completed':
      if (payload.stage === 'draft')
        return { stage: 'draft', message: `Draft ${payload.angle_index + 1} complete (${payload.drafts_so_far} ready)`, isTerminal: false };
      if (payload.stage === 'judge')
        return { stage: 'judge', message: payload.reasoning || 'Best draft selected', isTerminal: false };
      if (payload.stage === 'critique')
        return { stage: 'critique', message: `Found ${payload.issue_count || 0} issue(s)`, isTerminal: false };
      if (payload.stage === 'revise')
        return { stage: 'revise', message: 'Revision complete', isTerminal: false };
      break;
    case 'stage_failed_soft':
      return {
        stage: (payload.stage as ThinkHardStage) || 'running',
        message: `Warning: ${payload.error}. ${payload.fallback || 'Continuing...'}`,
        isTerminal: false,
      };
    case 'terminal':
      if (payload.state === 'succeeded')
        return { stage: 'succeeded', message: `Generated ${payload.persona_count || ''} persona(s)`, isTerminal: true };
      if (payload.state === 'failed')
        return { stage: 'failed', message: 'Generation failed', error: payload.error_code || 'Unknown error', isTerminal: true };
      if (payload.state === 'timed_out')
        return { stage: 'timed_out', message: 'Generation timed out', isTerminal: true };
      break;
  }
  return { stage: 'running', message: 'Processing...', isTerminal: false };
}

