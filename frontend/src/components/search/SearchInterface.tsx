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
  /**
   * `landing` — the canvas entry card: wordmark above the composer, launch badges below.
   * `panel`  — a composer embedded in chrome that already names itself (the refine terminal).
   *            Renders no wordmark, no badges: the panel header owns the identity.
   */
  variant?: 'landing' | 'panel';
  /** Fired on Escape only when nothing inside the composer consumed the key. */
  onEscape?: () => void;
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

export function SearchInterface({ onSubmit, isLoading, className, variant = 'panel', onEscape }: SearchInterfaceProps) {
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Escape unwinds one level at a time: the open dropdown first, then the surrounding panel.
  useEffect(() => {
    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (showModeDropdown) {
        setShowModeDropdown(false);
        return;
      }
      onEscape?.();
    }

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [showModeDropdown, onEscape]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    await onSubmit({
      text: input.trim().slice(0, MAX_CHARS),
      mode,
      files,
      fileId: attachedFileId ?? undefined,
    });
    setInput('');
    setAttachedFileId(null);
    handleFileRemoved();
  };

  const characterCount = input.length;
  const hasContent = input.trim().length > 0;
  const selectedMode = GENERATION_MODES[mode];

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      {variant === 'landing' && (
        <h1 className="pb-1 text-center font-display text-3xl tracking-tight text-foreground">
          PERSONA FORGE
        </h1>
      )}

      {/* Composer — the field is the panel's focus, so it carries the strong border. */}
      <form onSubmit={handleSubmit} className="w-full">
        <div
          {...getRootProps()}
          className={cn(
            "relative border-2 border-foreground/80 bg-background p-5 transition-colors duration-200",
            "focus-within:border-primary",
            isDragActive && "border-dashed border-primary",
          )}
        >
          <input {...getInputProps()} />
          {/* Drag overlay */}
          {isDragActive && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
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

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={MAX_CHARS}
            placeholder="Describe your product, service, or concept in detail. Include target market, key features, and business goals for the most accurate personas..."
            className={cn(
              "min-h-[110px] resize-none border-0 p-0 text-[15px] leading-relaxed shadow-none",
              "bg-transparent focus:ring-0 focus:border-0 focus:bg-transparent",
              "placeholder:font-normal placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-0",
              "caret-[hsl(var(--foreground))] [caret-shape:block]"
            )}
            disabled={isLoading}
          />

          {/* Control row — subordinate to the field it belongs to. */}
          <TooltipProvider delayDuration={200}>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
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

              <div className="flex items-center gap-3">
                <span
                  aria-live="polite"
                  className={cn(
                    "text-[11px] tabular-nums text-muted-foreground transition-colors duration-200",
                    characterCount > 7000 && "text-amber-700",
                    characterCount > 7800 && "text-destructive",
                  )}
                >
                  {characterCount} / {MAX_CHARS}
                </span>

                {/* Mode selector */}
                <div className="relative" ref={dropdownRef}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowModeDropdown(!showModeDropdown)}
                    className="text-muted-foreground"
                  >
                    <span aria-hidden="true">{selectedMode.icon}</span>
                    <span className="hidden sm:inline">{selectedMode.label}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>

                  {showModeDropdown && (
                    <div className="absolute bottom-full right-0 mb-2 z-[90] w-52 border-2 border-border bg-popover py-1 shadow-[5px_5px_0_hsl(var(--foreground)/0.8)]">
                      {Object.entries(GENERATION_MODES).map(([key, modeOption]) => {
                        const isSelected = key === mode;
                        const isDisabled = modeOption.disabled;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              if (!isDisabled) {
                                setMode(key as GenerationMode);
                                setShowModeDropdown(false);
                              }
                            }}
                            disabled={isDisabled}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2 text-left text-xs font-mono uppercase tracking-[0.1em]",
                              "transition-colors hover:bg-accent",
                              isSelected && "bg-accent text-accent-foreground",
                              isDisabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                            )}
                          >
                            <span aria-hidden="true" className="text-sm">{modeOption.icon}</span>
                            <span>{modeOption.label}</span>
                            {modeOption.disabled && (
                              <span className="ml-auto border border-border px-1.5 py-0.5 text-[10px] tracking-normal text-muted-foreground">
                                Soon
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={!hasContent || isLoading}
                  aria-label="Generate personas"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span className="hidden sm:inline">Generate</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TooltipProvider>
        </div>
      </form>

      {variant === 'landing' && (
        <div className="flex flex-wrap items-center justify-center gap-6">
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
      )}
    </div>
  );
}
