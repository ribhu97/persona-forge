import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModeSelector } from './ModeSelector';
import type { GenerationMode, ProcessedFile } from '@/types';
import { cn } from '@/lib/utils';
import { Loader2, Search } from 'lucide-react';

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

export function SearchInterface({ onSubmit, isLoading, className }: SearchInterfaceProps) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<GenerationMode>('quick');
  const [files] = useState<ProcessedFile[]>([]);

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

  return (
    <div className={cn("w-full max-w-4xl mx-auto space-y-8", className)}>
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Persona Generator
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Describe your product or service to generate detailed user personas powered by AI
        </p>
      </div>

      {/* Mode Selection */}
      <ModeSelector
        selectedMode={mode}
        onModeChange={setMode}
        disabled={isLoading}
      />

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your product, service, or concept in detail. Include target market, key features, and business goals for the most accurate personas..."
            className={cn(
              "min-h-[120px] text-base leading-relaxed resize-none",
              "border-2 border-dashed border-border hover:border-primary/50 focus:border-primary",
              "transition-colors duration-200",
              hasContent && "border-solid"
            )}
            disabled={isLoading}
          />
          
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className={cn(
              "text-xs text-muted-foreground",
              characterCount > 500 && "text-yellow-600",
              characterCount > 1000 && "text-red-600"
            )}>
              {characterCount} characters
            </span>
          </div>
        </div>

        {/* File Upload Area - Placeholder for future implementation */}
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center text-muted-foreground">
          <div className="space-y-2">
            <div className="text-sm">📎 File uploads coming soon</div>
            <div className="text-xs">Support for PDFs, images, and markdown files</div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-center">
          <Button
            type="submit"
            disabled={!hasContent || isLoading}
            size="lg"
            className="px-8 py-3 text-base font-medium"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Personas...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Generate Personas
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Quick Examples */}
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground">Need inspiration? Try these examples:</p>
        <div className="flex flex-wrap justify-center gap-2">
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
              className="text-xs px-3 py-1 bg-secondary hover:bg-secondary/80 rounded-full transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}