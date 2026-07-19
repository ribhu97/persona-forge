import { SearchInterface } from '@/components/search/SearchInterface';
import { PersonaPanel } from '@/components/persona/PersonaPanel';
import { ResponsiveLayout } from '@/components/layout/SplitLayout';
import { usePersonaStore } from '@/stores/personaStore';
import { useAuthStore } from '@/stores/authStore';
import type { Persona, BackendPersona, PersonaVersion, ThinkHardProgress } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { UserStatus } from '@/components/auth/UserStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { personaAPI, jobsAPI } from '@/lib/api';
import { useAppContext } from '@/App';
import { ThinkHardProgressView, parseJobEvent } from '@/components/ThinkHardProgress';

import { ChatInterface } from '@/components/chat/ChatInterface';
import { Sidebar } from '@/components/layout/Sidebar';
import { useChatStore } from '@/stores/chatStore';

export function MainAppView() {
  const { onLogin } = useAppContext();

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
    selectConversation,
    messages,
    currentConversationId,
    isLoading: isChatLoading,
    error: chatError
  } = useChatStore();

  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [shouldShowSplit, setShouldShowSplit] = useState(false);

  const [personaVersions, setPersonaVersions] = useState<PersonaVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const prevMessagesLength = useRef(0);

  // Think Hard job state
  const [thinkHardProgress, setThinkHardProgress] = useState<ThinkHardProgress | null>(null);
  const sseClientRef = useRef<{ close: () => void } | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => { sseClientRef.current?.close(); };
  }, []);

  // Sync chat personas to persona store and handle versioning
  useEffect(() => {
    if (currentConversationId && messages.length > 0) {
      const msgsWithPersonas = messages.filter(m => m.personas && m.personas.length > 0);

      const versions: PersonaVersion[] = msgsWithPersonas.map(m => {
        const personasList = (m.personas || []) as unknown as BackendPersona[];

        const convertedPersonas: Persona[] = personasList.map((p: any) => {
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
            id: String(p.id),
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

      const hasNewMessages = messages.length > prevMessagesLength.current;
      prevMessagesLength.current = messages.length;

      if (versions.length > 0) {
        const latestVersionId = versions[versions.length - 1].id;
        if (hasNewMessages || !selectedVersionId) {
          setSelectedVersionId(latestVersionId);
        }
      } else {
        setPersonas([]);
      }
    } else {
      setPersonaVersions([]);
    }
  }, [messages, currentConversationId, setPersonas]);

  useEffect(() => {
    if (personaVersions.length > 0) {
      const versionToShow = selectedVersionId
        ? personaVersions.find(v => v.id === selectedVersionId)
        : personaVersions[personaVersions.length - 1];

      if (versionToShow) {
        setPersonas(versionToShow.personas);
      }
    }
  }, [selectedVersionId, personaVersions, setPersonas]);

  useEffect(() => {
    if ((personas.length > 0 || currentConversationId) && !shouldShowSplit) {
      setShouldShowSplit(true);
    }
  }, [personas.length, currentConversationId, shouldShowSplit]);

  const handleUpdatePersona = async (id: string, updates: Partial<Persona>) => {
    const originalPersona = personas.find(p => p.id === id);
    updatePersona(id, updates);

    if (typeof id === 'string' && id.startsWith('persona-')) {
      return;
    }

    try {
      await personaAPI.updatePersona(id, updates);
    } catch (err) {
      console.error('Failed to update persona:', err);
      if (originalPersona) {
        updatePersona(id, originalPersona);
      }
    }
  };

  const handleClearAll = async () => {
    setIsTransitioning(true);
    await new Promise(resolve => setTimeout(resolve, 400));
    clearAll();
    setShouldShowSplit(false);
    setIsTransitioning(false);
  };

  const handleSearch = async (data: { text: string; mode: any; files: any[]; fileId?: string }) => {
    if (!isAuthenticated) {
      onLogin();
      return;
    }

    try {
      const conv = await createConversation(data.text);

      if (data.mode === 'think_hard') {
        // ── Think Hard: create a job and stream events ──
        setThinkHardProgress({ stage: 'queued', message: 'Creating job...', isTerminal: false });
        setShouldShowSplit(true);

        try {
          // One key per user send attempt — backend dedups duplicate submissions
          const idempotencyKey = crypto.randomUUID();
          const job = await jobsAPI.createJob(conv.id, {
            text: data.text,
            mode: 'think_hard',
            file_id: data.fileId,
            idempotency_key: idempotencyKey,
          });

          // Fetch messages to get the pending assistant message
          await selectConversation(conv.id);

          // Subscribe to SSE events
          sseClientRef.current?.close();
          const sseClient = jobsAPI.streamJobEvents(conv.id, job.id, {
            onEvent: (event) => {
              if (event.event && event.data) {
                const progress = parseJobEvent(event.event, event.data);
                setThinkHardProgress(progress);

                if (progress.isTerminal) {
                  // On terminal, fetch messages to get the final personas
                  setTimeout(() => {
                    selectConversation(conv.id);
                    setThinkHardProgress(null);
                  }, 500);
                  sseClientRef.current?.close();
                }
              }
            },
            onError: (err) => {
              console.error('SSE error:', err);
              setThinkHardProgress({
                stage: 'failed',
                message: 'Connection lost. Please refresh.',
                isTerminal: true,
                error: err.message,
              });
            },
          });
          sseClientRef.current = sseClient;
        } catch (err: any) {
          const status = err.response?.status;
          if (status === 402) {
            setThinkHardProgress(null);
            navigate('/pricing');
            return;
          }
          throw err;
        }
      } else {
        // ── Quick mode: existing synchronous flow ──
        await sendMessage(data.text, data.fileId);
      }
    } catch (err: any) {
      console.error('Failed to generate personas:', err);
      setThinkHardProgress(null);
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

  const isInitialState = personas.length === 0 && !currentConversationId;

  const leftPanel = isInitialState ? (
    <div className="h-full w-full bg-background relative flex flex-col">
      <div className="absolute top-4 right-4 z-50 flex items-center gap-6">
        <Link to="/blog">
          <Button
            variant="ghost"
            size="sm"
            className="terminal-prompt text-muted-foreground hover:text-foreground font-medium"
          >
            Blog
          </Button>
        </Link>
        <Link to="/pricing">
          <Button
            variant="ghost"
            size="sm"
            className="terminal-prompt text-muted-foreground hover:text-foreground font-medium"
          >
            Pricing
          </Button>
        </Link>
        <UserStatus onLoginClick={onLogin} />
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

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 py-4 px-6 text-center text-xs text-muted-foreground border-t border-border/50">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <span>© {new Date().getFullYear()} Pehloo</span>
          <span className="text-border">·</span>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <span className="text-border">·</span>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <span className="text-border">·</span>
          <a href="mailto:ribhu.lahiri@gmail.com" className="hover:text-foreground transition-colors">Contact</a>
        </div>
      </footer>
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
        {thinkHardProgress ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="w-full max-w-md">
              <ThinkHardProgressView progress={thinkHardProgress} />
            </div>
          </div>
        ) : (
          <PersonaPanel
            personas={personas}
            onUpdatePersona={handleUpdatePersona}
            onDeletePersona={deletePersona}
            onDuplicatePersona={handleDuplicatePersona}
            onClearAll={handleClearAll}
            isLoading={isChatLoading}
            isTransitioning={isTransitioning}
            versions={personaVersions}
            selectedVersionId={selectedVersionId || undefined}
            onSelectVersion={setSelectedVersionId}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <ErrorBoundary>
        <div className="absolute top-4 right-4 z-50 flex items-center gap-6">
          {!isInitialState && (
            <>
              <Link to="/blog">
                <Button
                  variant="ghost"
                  size="sm"
                  className="terminal-prompt text-muted-foreground hover:text-foreground font-medium bg-background/50 backdrop-blur-sm"
                >
                  Blog
                </Button>
              </Link>
              <Link to="/pricing">
                <Button
                  variant="ghost"
                  size="sm"
                  className="terminal-prompt text-muted-foreground hover:text-foreground font-medium bg-background/50 backdrop-blur-sm"
                >
                  Pricing
                </Button>
              </Link>
              <UserStatus onLoginClick={onLogin} />
            </>
          )}
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

        {/* Mobile experience banner */}
        <div className="md:hidden absolute top-0 left-0 right-0 z-[60] bg-yellow-50 border-b border-yellow-200 text-yellow-900 text-xs text-center px-4 py-2 font-medium">
          For the best experience, please use PersonaForge on a desktop.
        </div>

        <ResponsiveLayout
          sidebar={<Sidebar onLoginClick={onLogin} />}
          leftPanel={leftPanel}
          rightPanel={rightPanel}
          rightPanelLabel="Personas"
          rightPanelBadge={personas.length}
        />
      </ErrorBoundary>
    </div>
  );
}
