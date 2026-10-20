import { AlertTriangle, ArrowRight, Clock, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppError } from '@/lib/api';

interface Props {
  error: string;
  /** From the store's `errorType`; decides which affordance the user gets. */
  errorType: AppError['type'] | null;
  onRetry: () => void;
  onUpgrade: () => void;
  onDismiss: () => void;
  isRetrying: boolean;
}

/**
 * Typed error surface for the canvas. `ChatInterface` owned this before the canvas rewrite; the
 * affordances are load-bearing, not decoration: a capacity failure is only recoverable via Retry
 * (the failed prompt is preserved in the store for exactly that), and a 403 limit is only
 * actionable via the upgrade path.
 */
export function CanvasErrorBanner({ error, errorType, onRetry, onUpgrade, onDismiss, isRetrying }: Props) {
  const tone = errorType === 'limit'
    ? 'border-signal-mood/50 bg-signal-mood/10 text-signal-mood'
    : errorType === 'capacity'
      ? 'border-signal-mood/50 bg-signal-mood/10 text-signal-mood'
      : 'border-destructive/50 bg-destructive/10 text-destructive';

  const Icon = errorType === 'capacity' ? Clock : AlertTriangle;
  const title = errorType === 'limit'
    ? 'Plan limit reached'
    : errorType === 'capacity'
      ? "We're at capacity right now"
      : errorType === 'auth'
        ? 'Session expired'
        : 'Something went wrong';

  return (
    <div className={cn('flex items-start gap-3 border-2 p-3 shadow-[5px_5px_0_hsl(var(--foreground)/0.6)]', tone)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">{title}</p>
        <p className="mt-0.5 text-sm text-foreground">{error}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {errorType === 'capacity' && (
          <Button variant="outline" size="sm" className="h-7" onClick={onRetry} disabled={isRetrying}>
            <RotateCcw className={cn('h-3.5 w-3.5', isRetrying && 'animate-spin')} />
            {isRetrying ? 'Retrying…' : 'Retry'}
          </Button>
        )}
        {errorType === 'limit' && (
          <Button variant="outline" size="sm" className="h-7" onClick={onUpgrade}>
            Upgrade
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss} aria-label="Dismiss error">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
