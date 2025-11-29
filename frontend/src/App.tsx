import { SearchInterface } from '@/components/search/SearchInterface';
import { PersonaPanel } from '@/components/persona/PersonaPanel';
import { ResponsiveLayout } from '@/components/layout/SplitLayout';
import { usePersonaStore } from '@/stores/personaStore';
import { useAuthStore } from '@/stores/authStore';
import type { Persona } from '@/types';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { UserStatus } from '@/components/auth/UserStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import { ChatInterface } from '@/components/chat/ChatInterface';
import { Sidebar } from '@/components/layout/Sidebar';
import { useChatStore } from '@/stores/chatStore';

function App() {
  const {
    personas,
    setPersonas,
    updatePersona,
    deletePersona,
    addPersona,
    clearAll,
  } = usePersonaStore();

  const {
    createConversation,
    sendMessage,
    messages,
    currentConversationId,
    isLoading: isChatLoading,
    error: chatError
  } = useChatStore();

  const { isAuthenticated, checkAuth } = useAuthStore();
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [shouldShowSplit, setShouldShowSplit] = useState(false);

  // Sync chat personas to persona store
  useEffect(() => {
    if (currentConversationId && messages.length > 0) {
      const allPersonas = messages.flatMap(m => m.personas || []).map((p: any) => {
        const extractStrings = (arr: any[], key: string) => {
          if (!Array.isArray(arr)) return [];
          return arr.map(item => {
            if (typeof item === 'object' && item !== null && key in item) {
              return item[key];
            }
            if (typeof item === 'string') return item;
            return ''; // Never return the object itself
          });
        };

        return {
          ...p,
          demographics: {
            age: p.demographics?.age || '',
            location: p.demographics?.location || '',
            education: p.demographics?.education || '',
            industry: p.demographics?.industry || '',
          },
          goals: extractStrings(p.goals, 'goal_text'),
          frustrations: extractStrings(p.frustrations, 'frustration_text'),
          behavioral_patterns: extractStrings(p.behavioral_patterns, 'pattern_text'),
          influence_networks: extractStrings(p.influence_networks, 'network_text'),
          recruitment_criteria: extractStrings(p.recruitment_criteria, 'criteria_text'),
          research_assumptions: extractStrings(p.research_assumptions, 'assumption_text'),
        };
      });
      // Ensure IDs are strings for consistency if needed, or just pass as is since we updated the type
      setPersonas(allPersonas as Persona[]);
    }
  }, [messages, currentConversationId, setPersonas]);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle view transitions
  useEffect(() => {
    if ((personas.length > 0 || currentConversationId) && !shouldShowSplit) {
      setShouldShowSplit(true);
    }
  }, [personas.length, currentConversationId, shouldShowSplit]);

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

    // setGenerating(true); // handled by chatStore
    // setError(null);

    try {
      await createConversation(data.text);
      await sendMessage(data.text);
    } catch (err: any) {
      console.error('Failed to generate personas:', err);
      // setError(err instanceof Error ? err.message : 'Failed to generate personas');
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

  // Determine content based on state
  const isInitialState = personas.length === 0 && !currentConversationId;

  const leftPanel = isInitialState ? (
    <div className="h-full w-full bg-background relative flex flex-col">
      <div className="absolute top-4 right-4 z-50">
        <UserStatus onLoginClick={() => setIsAuthDialogOpen(true)} />
      </div>

      <div className={cn(
        "flex-1 flex items-center justify-center transition-all duration-500 ease-out",
        isTransitioning
          ? "opacity-0 scale-95 transform"
          : "opacity-100 scale-100"
      )}>
        <SearchInterface
          onSubmit={handleSearch}
          isLoading={isChatLoading}
        />
      </div>

      {chatError && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 p-4 bg-red-50 border border-red-200 rounded-lg max-w-md animate-in slide-in-from-bottom-4 duration-300 ease-out">
          <p className="text-red-700 text-sm">{chatError}</p>
        </div>
      )}
    </div>
  ) : (
    <div className="h-full overflow-hidden bg-background">
      <ChatInterface />
    </div>
  );

  const rightPanel = isInitialState ? null : (
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
          isLoading={isChatLoading}
          isTransitioning={isTransitioning}
        />
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <ErrorBoundary>
        <div className="absolute top-4 right-4 z-50">
          {!isInitialState && <UserStatus onLoginClick={() => setIsAuthDialogOpen(true)} />}
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
          sidebar={<Sidebar />}
          leftPanel={leftPanel}
          rightPanel={rightPanel}
          rightPanelLabel="Personas"
          rightPanelBadge={personas.length}
        />

        <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />
      </ErrorBoundary>
    </div>
  );
}

export default App;
