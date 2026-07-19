import { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { GenerationMode, ProcessedFile } from '@/types';
import { cn } from '@/lib/utils';
import { Loader2, ArrowRight, ChevronDown } from 'lucide-react';
import { FileUpload } from '@/components/chat/FileUpload';
import { ACCEPTED_TYPES, useFileUpload } from '@/hooks/useFileUpload';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const MAX_CHARS = 8000;

interface SearchData {
  text: string;
  mode: GenerationMode;
  files: ProcessedFile[];
  fileId?: string;
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
    disabled: false,
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
  const [attachedFileId, setAttachedFileId] = useState<string | null>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { handleFiles, handleRemove: handleFileRemoved, state: fileState, isUploading } = useFileUpload({
    onFileReady: (fileId) => setAttachedFileId(fileId),
    onFileRemoved: () => setAttachedFileId(null),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFiles,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    disabled: isLoading || isUploading,
    noClick: true,   // clicks handled by the FileUpload button
    noKeyboard: true,
  });

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
      text: input.trim().slice(0, MAX_CHARS),
      mode,
      files,
      fileId: attachedFileId ?? undefined,
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
      <div className="text-center space-y-4 transition-all duration-500 ease-out">
        <h1 className="text-6xl tracking-tight text-foreground transition-all duration-500 pb-2 ease-out font-display">
          PERSONA FORGE
        </h1>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-mono">
          a Pehloo tool
        </p>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed transition-all duration-500 ease-out">
          Describe your product or service to generate detailed user personas powered by AI
        </p>
      </div>

      {/* Integrated Search Bar */}
      <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto transition-all duration-500 ease-out">
        <div className="relative">
          <div
            {...getRootProps()}
            style={{ backgroundColor: 'hsl(var(--background))' }}
            className={cn(
              "relative border-2 border-foreground/80 shadow-[4px_4px_0_0_hsl(var(--foreground))] p-6 transition-all duration-300 ease-out",
              "focus-within:border-primary",
              isDragActive && "border-dashed border-primary",
            )}
          >
            <input {...getInputProps()} />
            {/* Drag overlay */}
            {isDragActive && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="flex flex-col items-center gap-2 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span className="text-sm font-medium">Drop file to attach</span>
                </div>
              </div>
            )}
            {/* Main Input Area */}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_CHARS}
              placeholder="Describe your product, service, or concept in detail. Include target market, key features, and business goals for the most accurate personas..."
              className={cn(
                "min-h-[120px] text-lg leading-relaxed resize-none border-0 p-0 shadow-none transition-all duration-300 ease-out font-medium",
                "focus:ring-0 focus:border-0 bg-transparent outline-none focus:bg-muted/20",
                "placeholder:text-muted-foreground placeholder:font-normal",
                "focus-visible:outline-none focus-visible:ring-0",
                "caret-[hsl(var(--foreground))] [caret-shape:block]"
              )}
              disabled={isLoading}
            />

            {/* Bottom Controls Bar */}
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-border transition-all duration-300 ease-out">
                {/* Left Side Controls */}
                <div className="flex items-center gap-3">
                  {/* File Upload — click-to-browse; drag handled by the outer search box */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span aria-label="Attach file">
                        <FileUpload
                          onFileReady={(fileId) => setAttachedFileId(fileId)}
                          onFileRemoved={() => setAttachedFileId(null)}
                          disabled={isLoading}
                          externalState={fileState}
                          externalHandleRemove={handleFileRemoved}
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Attach file (PDF, image, markdown)
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Right Side Controls */}
                <div className="flex items-center gap-3">
                  {/* Character Count */}
                  <span
                    aria-live="polite"
                    className={cn(
                      "text-xs font-mono text-muted-foreground transition-colors duration-200",
                      characterCount > 7000 && "text-yellow-600",
                      characterCount > 7800 && "text-red-600",
                    )}
                  >
                    {characterCount} / {MAX_CHARS}
                  </span>

                  {/* Mode Selector Dropdown */}
                  <div className="relative" ref={dropdownRef}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowModeDropdown(!showModeDropdown)}
                      className="terminal-prompt h-9 px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 ease-out"
                    >
                      <span className="mr-2">{selectedMode.icon}</span>
                      {selectedMode.label}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>

                    {/* Dropdown Menu */}
                    {showModeDropdown && (
                      <div className="absolute top-full left-0 mt-3 w-52 bg-background border border-border z-50 animate-in fade-in slide-in-from-top-2 duration-200 ease-out backdrop-blur-sm">
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
                                "w-full px-4 py-3 text-left text-sm font-medium hover:bg-muted transition-all duration-200 ease-out mx-2 my-1",
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
                    aria-label="Generate personas"
                    className={cn(
                      "group h-10 px-5 font-semibold inline-flex items-center transition-all duration-200 ease-out",
                      hasContent && !isLoading
                        ? "bg-primary hover:bg-primary/80 text-primary-foreground"
                        : "bg-primary/60 hover:bg-primary/70 text-primary-foreground"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span className="hidden sm:inline">Generate</span>
                        <ArrowRight className="h-4 w-4 sm:ml-2 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TooltipProvider>
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
              type="button"
              onClick={() => setInput(example)}
              disabled={isLoading}
              className={cn(
                "terminal-prompt group",
                "text-sm px-4 py-2 border border-border rounded-full",
                "bg-background hover:bg-secondary hover:border-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "transition-all duration-200 font-mono font-medium tracking-wide",
                "inline-flex items-center gap-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {example}
              <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
            </button>
          ))}
        </div>
      </div>

      {/* Featured-on badges */}
      <div className="flex flex-wrap justify-center items-center gap-6 pt-2 pb-6 transition-all duration-500 ease-out">
        <a href="https://tinylaunch.com" target="_blank" rel="noopener">
          <img
            src="https://tinylaunch.com/tinylaunch_badge_featured_on.svg"
            alt="TinyLaunch Badge"
            style={{ width: 202, height: 'auto' }}
          />
        </a>
        <a href="https://peerpush.com/p/personaforge" target="_blank" rel="noopener">
          <img
            src="https://peerpush.com/p/personaforge/badge.png"
            alt="Pehloo PersonaForge on PeerPush"
            style={{ width: 230, height: 'auto' }}
          />
        </a>
        <a href="https://fazier.com/launches/personaforge.pehloo.xyz" target="_blank" rel="noopener">
          <img
            src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&theme=neutral"
            alt="Fazier badge"
            style={{ width: 120, height: 'auto' }}
          />
        </a>
      </div>
    </div>
  );
}