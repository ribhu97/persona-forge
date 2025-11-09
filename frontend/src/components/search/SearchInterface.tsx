import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { GenerationMode, ProcessedFile } from '@/types';
import { cn } from '@/lib/utils';
import { Loader2, Search, Plus, ChevronDown, Settings2 } from 'lucide-react';

interface SearchData {
  text: string;
  mode: GenerationMode;
  files: ProcessedFile[];
}

interface SearchInterfaceProps {
  onSubmit: (data: SearchData) => Promise<void>;
  isLoading: boolean;
  className?: string;
}

const GENERATION_MODES = {
  quick: {
    label: 'Quick Generate',
    icon: '⚡',
    disabled: false,
  },
  think_hard: {
    label: 'Think Hard',
    icon: '🧠',
    disabled: true,
  },
  homework: {
    label: 'Do My Homework',
    icon: '📚',
    disabled: true,
  },
} as const;

export function SearchInterface({ onSubmit, isLoading, className }: SearchInterfaceProps) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<GenerationMode>('quick');
  const [files] = useState<ProcessedFile[]>([]);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModeDropdown(false);
      }
    }

    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowModeDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    await onSubmit({
      text: input.trim(),
      mode,
      files,
    });
  };

  const characterCount = input.length;
  const hasContent = input.trim().length > 0;
  const selectedMode = GENERATION_MODES[mode];

  return (
    <div className={cn(
      "w-full max-w-4xl mx-auto min-h-screen flex flex-col justify-center transition-all duration-500 ease-out",
      className
    )}>
      {/* Header */}
      <div className="text-center space-y-6 transition-all duration-500 ease-out">
        <h1 className="text-5xl font-bold font-mono tracking-tight bg-gradient-to-r from-[hsl(var(--title-gradient-from))] to-[hsl(var(--title-gradient-to))] bg-clip-text text-transparent transition-all duration-500 ease-out font-display">
          Persona Generator
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed transition-all duration-500 ease-out">
          Describe your product or service to generate detailed user personas powered by AI
        </p>
      </div>

      {/* Integrated Search Bar */}
      <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto transition-all duration-500 ease-out">
        <div className="relative">
          <div className="relative bg-background border-2 border-border rounded-2xl p-6 shadow-soft hover:shadow-medium focus-within:border-black focus-within:shadow-strong transition-all duration-300 ease-out">
            {/* Main Input Area */}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your product, service, or concept in detail. Include target market, key features, and business goals for the most accurate personas..."
              className={cn(
                "min-h-[120px] text-lg leading-relaxed resize-none border-0 p-0 shadow-none transition-all duration-300 ease-out font-medium",
                "focus:ring-0 focus:border-0 bg-transparent outline-none focus:bg-muted/20",
                "placeholder:text-muted-foreground placeholder:font-normal",
                "focus-visible:outline-none focus-visible:ring-0"
              )}
              disabled={isLoading}
            />
            
            {/* Bottom Controls Bar */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border transition-all duration-300 ease-out">
              {/* Left Side Controls */}
              <div className="flex items-center gap-3">
                {/* File Upload Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 hover:bg-muted/60 transition-all duration-200 ease-out rounded-lg"
                  disabled={true}
                  title="Adding files to context coming soon"
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </Button>
                
                {/* Settings Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 hover:bg-muted/60 transition-all duration-200 ease-out rounded-lg"
                  disabled={true}
                  title="Fine-grained controls coming soon"
                >
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>

              {/* Right Side Controls */}
              <div className="flex items-center gap-3">
                {/* Mode Selector Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowModeDropdown(!showModeDropdown)}
                    className="h-9 px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 ease-out rounded-lg"
                    disabled={isLoading}
                  >
                    <span className="mr-2">{selectedMode.icon}</span>
                    {selectedMode.label}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                  
                  {/* Dropdown Menu */}
                  {showModeDropdown && (
                    <div className="absolute top-full left-0 mt-3 w-52 bg-background border border-border rounded-xl shadow-strong z-50 animate-in fade-in slide-in-from-top-2 duration-200 ease-out backdrop-blur-sm">
                      {Object.entries(GENERATION_MODES).map(([key, modeOption]) => {
                        const isSelected = key === mode;
                        const isDisabled = modeOption.disabled;
                        
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              if (!isDisabled) {
                                setMode(key as GenerationMode);
                                setShowModeDropdown(false);
                              }
                            }}
                            disabled={isDisabled}
                            className={cn(
                              "w-full px-4 py-3 text-left text-sm font-medium hover:bg-muted transition-all duration-200 ease-out rounded-lg mx-2 my-1",
                              "flex items-center gap-3",
                              isSelected && "bg-primary/10 text-primary",
                              isDisabled && "opacity-50 cursor-not-allowed",
                              "bg-background"
                            )}
                          >
                            <span className="text-lg">{modeOption.icon}</span>
                            <span>{modeOption.label}</span>
                            {modeOption.disabled && (
                              <span className="ml-auto text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full font-medium">
                                Soon
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <Button
                  type="submit"
                  disabled={!hasContent || isLoading}
                  size="sm"
                  className={cn(
                    "h-9 px-6 font-semibold transition-all duration-200 ease-out rounded-lg",
                    hasContent && !isLoading
                      ? "bg-black hover:bg-gray-800 text-white shadow-medium hover:shadow-strong"
                      : "bg-primary hover:bg-primary/90 shadow-soft"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className={cn(
                      "h-4 w-4",
                      hasContent && !isLoading ? "text-white" : ""
                    )} />
                  )}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Character Count */}
          <div className="absolute top-6 right-6">
            <span className={cn(
              "text-sm font-medium transition-all duration-200 ease-out",
              characterCount > 500 && "text-yellow-600",
              characterCount > 1000 && "text-red-600"
            )}>
              {characterCount}
            </span>
          </div>
        </div>
      </form>

      {/* Quick Examples */}
      <div className="text-center space-y-4 py-4 transition-all duration-500 ease-out">
        <p className="text-sm text-muted-foreground font-medium">Need inspiration? Try these examples:</p>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            "A mobile app for meal planning",
            "B2B project management software",
            "Eco-friendly skincare brand",
            "Online learning platform for kids"
          ].map((example) => (
            <button
              key={example}
              onClick={() => setInput(example)}
              disabled={isLoading}
              className="text-sm px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-full transition-all duration-200 ease-out font-medium shadow-soft hover:shadow-medium"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}