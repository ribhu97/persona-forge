import type { GenerationMode } from '@/types';
import { cn } from '@/lib/utils';

interface ModeSelectorProps {
  selectedMode: GenerationMode;
  onModeChange: (mode: GenerationMode) => void;
  disabled?: boolean;
}

const GENERATION_MODES = {
  quick: {
    label: 'Quick Generate',
    description: 'Fast persona creation with basic details',
    icon: '⚡',
    processingTime: '~30 seconds',
    features: ['Basic demographics', 'Core goals and frustrations'],
    disabled: false,
  },
  think_hard: {
    label: 'Think Hard',
    description: 'Detailed analysis with comprehensive insights',
    icon: '🧠',
    processingTime: '~2 minutes',
    features: ['Detailed behavioral patterns', 'Market research insights'],
    disabled: true,
  },
  homework: {
    label: 'Do My Homework',
    description: 'Research-grade personas with citations',
    icon: '📚',
    processingTime: '~5 minutes',
    features: ['Academic citations', 'Research methodology'],
    disabled: true,
  },
} as const;

export function ModeSelector({ selectedMode, onModeChange, disabled }: ModeSelectorProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-2xl mx-auto">
      {Object.entries(GENERATION_MODES).map(([key, mode]) => {
        const isSelected = selectedMode === key;
        const isDisabled = disabled || mode.disabled;
        
        return (
          <button
            key={key}
            onClick={() => !isDisabled && onModeChange(key as GenerationMode)}
            disabled={isDisabled}
            className={cn(
              "flex-1 p-4 rounded-lg border transition-all duration-200",
              "text-left hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-primary/50",
              isDisabled && "opacity-50 cursor-not-allowed hover:border-border"
            )}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl" role="img" aria-hidden="true">
                {mode.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-sm">{mode.label}</h3>
                  {mode.disabled && (
                    <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                      Coming Soon
                    </span>
                  )}
                </div>
                {/* <p className="text-xs text-muted-foreground mb-2">
                  {mode.description}
                </p>
                <div className="text-xs text-muted-foreground">
                  <div className="mb-1">{mode.processingTime}</div>
                  <ul className="space-y-0.5">
                    {mode.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-1">
                        <span className="w-1 h-1 bg-current rounded-full flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div> */}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}