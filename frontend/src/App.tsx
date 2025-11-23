import { SearchInterface } from '@/components/search/SearchInterface';
import { PersonaPanel } from '@/components/persona/PersonaPanel';
import { ResponsiveLayout } from '@/components/layout/SplitLayout';
import { usePersonaStore } from '@/stores/personaStore';
import { useAuthStore } from '@/stores/authStore';
import { personaAPI } from '@/lib/api';
import type { Persona } from '@/types';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { UserStatus } from '@/components/auth/UserStatus';

function App() {
  const {
    personas,
    isGenerating,
    error,
    setPersonas,
    setGenerating,
    setError,
    updatePersona,
    deletePersona,
    addPersona,
    clearAll,
  } = usePersonaStore();

  const { isAuthenticated, checkAuth } = useAuthStore();
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [shouldShowSplit, setShouldShowSplit] = useState(false);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle view transitions
  useEffect(() => {
    if (personas.length > 0 && !shouldShowSplit) {
      setShouldShowSplit(true);
    }
  }, [personas.length, shouldShowSplit]);

  const handleClearAll = async () => {
    setIsTransitioning(true);

    // Wait for fade-out animation
    await new Promise(resolve => setTimeout(resolve, 400));

    clearAll();
    setShouldShowSplit(false);
    setIsTransitioning(false);
  };

  const handleSearch = async (data: { text: string; mode: any; files: any[] }) => {
    if (!isAuthenticated) {
      setIsAuthDialogOpen(true);
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await personaAPI.generatePersonas({
        text: data.text,
        mode: data.mode,
        files: data.files,
      });

      // Convert backend personas to frontend format with IDs
      const personasWithIds: Persona[] = response.personas.map((persona, index) => ({
        ...persona,
        id: `persona-${Date.now()}-${index}`,
      }));

      setPersonas(personasWithIds);
    } catch (err: any) {
      console.error('Failed to generate personas:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate personas');
    } finally {
      setGenerating(false);
    }
  };

  const handleDuplicatePersona = (persona: Persona) => {
    const duplicated: Persona = {
      ...persona,
      id: `persona-${Date.now()}-duplicate`,
      name: `${persona.name} (Copy)`,
    };
    addPersona(duplicated);
  };

  const handleExportAll = () => {
    // TODO: Implement PDF export functionality
    console.log('Export all personas');
  };

  // If no personas exist, show centered search interface
  if (personas.length === 0) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-background relative">
        <div className="absolute top-4 right-4 z-50">
          <UserStatus onLoginClick={() => setIsAuthDialogOpen(true)} />
        </div>

        <div className={cn(
          "transition-all duration-500 ease-out",
          isTransitioning
            ? "opacity-0 scale-95 transform"
            : "opacity-100 scale-100"
        )}>
          <SearchInterface
            onSubmit={handleSearch}
            isLoading={isGenerating}
          />
        </div>

        {error && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 p-4 bg-red-50 border border-red-200 rounded-lg max-w-md animate-in slide-in-from-bottom-4 duration-300 ease-out">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />
      </div>
    );
  }

  // If personas exist, show split layout
  const leftPanel = (
    <div className="h-full overflow-auto bg-background">
      <div className="p-6">
        <div className={cn(
          "transition-all duration-500 ease-out",
          isTransitioning
            ? "opacity-0 -translate-x-4 transform"
            : "opacity-100 translate-x-0"
        )}>
          <SearchInterface
            onSubmit={handleSearch}
            isLoading={isGenerating}
          />
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300 ease-out">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );

  const rightPanel = (
    <div className="h-full bg-muted/30">
      <div className={cn(
        "transition-all duration-500 ease-out",
        isTransitioning
          ? "opacity-0 translate-x-4 transform"
          : "opacity-100 translate-x-0"
      )}>
        <PersonaPanel
          personas={personas}
          onUpdatePersona={updatePersona}
          onDeletePersona={deletePersona}
          onDuplicatePersona={handleDuplicatePersona}
          onExportAll={handleExportAll}
          onClearAll={handleClearAll}
          isLoading={isGenerating}
          isTransitioning={isTransitioning}
        />
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <div className="absolute top-4 right-4 z-50">
        <UserStatus onLoginClick={() => setIsAuthDialogOpen(true)} />
      </div>

      {/* Transition Overlay */}
      {isTransitioning && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center transition-all duration-500 ease-out">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-muted-foreground">Preparing new search...</p>
          </div>
        </div>
      )}

      <ResponsiveLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        rightPanelLabel="Personas"
        rightPanelBadge={personas.length}
      />

      <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />
    </div>
  );
}

export default App;
