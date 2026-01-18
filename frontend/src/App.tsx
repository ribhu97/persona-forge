import { SearchInterface } from '@/components/search/SearchInterface';
import { PersonaPanel } from '@/components/persona/PersonaPanel';
import { ResponsiveLayout } from '@/components/layout/SplitLayout';
import { usePersonaStore } from '@/stores/personaStore';
import { useAuthStore } from '@/stores/authStore';
import type { Persona, BackendPersona, PersonaVersion } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { UserStatus } from '@/components/auth/UserStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PricingPage } from '@/components/pricing/PricingPage';
import { Button } from '@/components/ui/button';

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
  const [showPricing, setShowPricing] = useState(false);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [shouldShowSplit, setShouldShowSplit] = useState(false);

  const [personaVersions, setPersonaVersions] = useState<PersonaVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const prevMessagesLength = useRef(0);

  // Sync chat personas to persona store and handle versioning
  useEffect(() => {
    if (currentConversationId && messages.length > 0) {
      // 1. Identify versions from messages
      const msgsWithPersonas = messages.filter(m => m.personas && m.personas.length > 0);

      const versions: PersonaVersion[] = msgsWithPersonas.map(m => {
        // Transformation logic
        const personasList = (m.personas || []) as unknown as BackendPersona[]; // Cast assuming backend returns correct shape now relative to type

        const convertedPersonas: Persona[] = personasList.map((p: any) => {
          // Helper to extract strings from arrays of objects if needed, or if types match directly
          // The backend now returns {goal_text: string, ...}[] but frontend Persona expects string[]
          // We need to map them.
          const extractStrings = (arr: any[], key: string) => {
            if (!Array.isArray(arr)) return [];
            return arr.map(item => {
              if (typeof item === 'object' && item !== null && key in item) {
                return String(item[key]);
              }
              if (typeof item === 'string') return item;
              return '';
            }).filter(Boolean);
          };

          return {
            id: p.id,
            name: p.name,
            status: p.status,
            role: p.role,
            tech_comfort: p.tech_comfort,
            scenario_context: p.scenario_context || '',
            demographics: {
              age: String(p.demographics?.age || ''),
              location: String(p.demographics?.location || ''),
              education: String(p.demographics?.education || ''),
              industry: String(p.demographics?.industry || ''),
            },
            goals: extractStrings(p.goals, 'goal_text'),
            frustrations: extractStrings(p.frustrations, 'frustration_text'),
            behavioral_patterns: extractStrings(p.behavioral_patterns, 'pattern_text'),
            influence_networks: extractStrings(p.influence_networks, 'network_text'),
            recruitment_criteria: extractStrings(p.recruitment_criteria, 'criteria_text'),
            research_assumptions: extractStrings(p.research_assumptions, 'assumption_text'),
          };
        });

        return {
          id: String(m.id),
          timestamp: new Date(m.created_at),
          personas: convertedPersonas
        };
      });

      setPersonaVersions(versions);

      // 2. Determine which version to show
      // If new messages arrived (length changed), auto-switch to latest
      const hasNewMessages = messages.length > prevMessagesLength.current;
      prevMessagesLength.current = messages.length;

      if (versions.length > 0) {
        const latestVersionId = versions[versions.length - 1].id;

        if (hasNewMessages || !selectedVersionId) {
          // Auto-select latest
          setSelectedVersionId(latestVersionId);
        }
      } else {
        setPersonas([]);
      }
    } else {
      setPersonaVersions([]);
      // setPersonas([]); // Don't clear immediately if we want to show empty state via persona store?
      // Actually persona store clearAll does this.
    }
  }, [messages, currentConversationId, setPersonas]); // removed selectedVersionId from deps to avoid loops?

  // Effect to update displayed personas based on selection
  useEffect(() => {
    if (personaVersions.length > 0) {
      // If selectedVersionId is valid, use it, else use latest
      const versionToShow = selectedVersionId
        ? personaVersions.find(v => v.id === selectedVersionId)
        : personaVersions[personaVersions.length - 1];

      if (versionToShow) {
        setPersonas(versionToShow.personas);
      }
    }
  }, [selectedVersionId, personaVersions, setPersonas]);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle logout cleanup
  useEffect(() => {
    if (!isAuthenticated) {
      useChatStore.getState().reset();
      usePersonaStore.getState().clearAll();
    }
  }, [isAuthenticated]);

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

  // Determine content based on state
  const isInitialState = personas.length === 0 && !currentConversationId;

  const leftPanel = isInitialState ? (
    <div className="h-full w-full bg-background relative flex flex-col">
      <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPricing(true)}
          className="text-muted-foreground hover:text-foreground font-medium"
        >
          Pricing
        </Button>
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
          onClearAll={handleClearAll}
          isLoading={isChatLoading}
          isTransitioning={isTransitioning}
          versions={personaVersions}
          selectedVersionId={selectedVersionId || undefined}
          onSelectVersion={setSelectedVersionId}
        />
      </div>
    </div>
  );

  // If showing pricing, render only the pricing page
  if (showPricing) {
    return (
      <div className="h-screen w-screen overflow-auto bg-background">
        <PricingPage
          onClose={() => setShowPricing(false)}
          isAuthenticated={isAuthenticated}
          onLogin={() => setIsAuthDialogOpen(true)}
        />
      </div>
    );
  }

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
