import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePersonaChatStore } from '@/stores/personaChatStore';
import { usePersonaStore } from '@/stores/personaStore';
import { useAuthStore } from '@/stores/authStore';
import { personaAPI } from '@/lib/api';
import type { Persona, BackendPersona } from '@/types';
import type { TagType } from '@/types/chat';
import { PersonaChatTopbar } from './PersonaChatTopbar';
import { PersonaChatThread } from './PersonaChatThread';
import { PersonaChatComposer } from './PersonaChatComposer';
import { PersonaChatRail } from './PersonaChatRail';

function backendToPersona(p: BackendPersona): Persona {
  const extractStrings = (arr: any[], key: string): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(item => {
        if (typeof item === 'object' && item !== null && key in item) return String(item[key]);
        if (typeof item === 'string') return item;
        return '';
      })
      .filter(Boolean);
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
}

function getShowTrait(): boolean {
  try {
    const stored = localStorage.getItem('persona_chat_show_trait');
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function setShowTraitPref(val: boolean) {
  try {
    localStorage.setItem('persona_chat_show_trait', String(val));
  } catch {}
}

export function PersonaChatPage() {
  const { personaId: personaIdStr } = useParams<{ personaId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [persona, setPersona] = useState<Persona | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTrait, setShowTrait] = useState(getShowTrait);

  const { sessions, loadSession, sendMessage, retryMessage, clearSession, setFeedback, toggleTag } =
    usePersonaChatStore();

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check auth
  useEffect(() => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('openAuthDialog'));
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const personaId = Number(personaIdStr);

  // Hydrate persona — check store first, then fetch from API
  const { personas: storePersonas } = usePersonaStore();

  useEffect(() => {
    if (isNaN(personaId)) {
      setLoadError('Invalid persona ID.');
      return;
    }

    // Fast path: already in client store
    const found = storePersonas.find(p => String(p.id) === personaIdStr || Number(p.id) === personaId);
    if (found) {
      setPersona(found);
      return;
    }

    // Fetch from API (direct link / reload)
    personaAPI.getPersona(personaId)
      .then(bp => setPersona(backendToPersona(bp)))
      .catch(err => {
        if (err.response?.status === 404) {
          setLoadError('Persona not found.');
        } else if (err.response?.status === 401) {
          window.dispatchEvent(new CustomEvent('openAuthDialog'));
          navigate('/');
        } else {
          setLoadError('Failed to load persona.');
        }
      });
  }, [personaId, personaIdStr, storePersonas, navigate]);

  // Load chat session once persona is known
  useEffect(() => {
    if (persona && !isNaN(personaId)) {
      loadSession(personaId);
    }
  }, [persona, personaId, loadSession]);

  const handleSend = useCallback((content: string) => {
    sendMessage(personaId, content);
  }, [personaId, sendMessage]);

  const handleRestart = useCallback(async () => {
    await clearSession(personaId);
  }, [personaId, clearSession]);

  const handleFeedback = useCallback((msgId: number, value: 'up' | 'down' | null) => {
    setFeedback(personaId, msgId, value);
  }, [personaId, setFeedback]);

  const handleToggleTag = useCallback((msgId: number, tag: TagType) => {
    toggleTag(personaId, msgId, tag);
  }, [personaId, toggleTag]);

  const handleToggleTrait = useCallback(() => {
    setShowTrait(v => {
      setShowTraitPref(!v);
      return !v;
    });
  }, []);

  const handleRetry = useCallback((failedMessageId: number, content: string) => {
    retryMessage(personaId, failedMessageId, content);
  }, [personaId, retryMessage]);

  const session = sessions[personaId];
  const messages = session?.messages ?? [];
  const isLoading = session?.isLoading ?? false;
  const lastPersonaMsg = [...messages].reverse().find(m => m.role === 'persona');
  const lastTrait = lastPersonaMsg?.trait;
  const sessionError = session?.error;
  useEffect(() => {
    if (!sessionError) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(sessionError);
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, [sessionError]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 font-mono">
        <div className="text-[11px] tracking-[0.15em] uppercase text-muted-foreground">{loadError}</div>
        <button
          onClick={() => navigate('/')}
          className="text-[11px] tracking-[0.15em] uppercase border border-foreground/30 px-4 py-2 hover:bg-muted/30 transition-colors"
          style={{ borderRadius: 0 }}
        >
          ← BACK TO PERSONAS
        </button>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="flex items-center justify-center h-full font-mono text-[11px] tracking-[0.15em] uppercase text-muted-foreground">
        LOADING PERSONA…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <PersonaChatTopbar persona={persona} session={session} onRestart={handleRestart} />

      {/* Error toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 font-mono text-[11px] tracking-[0.12em] px-4 py-2 flex items-center gap-3"
          style={{
            transform: 'translateX(-50%)',
            borderRadius: 0,
            background: '#c0392b',
            color: '#fff',
            border: '1px solid #922b21',
            boxShadow: '2px 2px 0 rgba(0,0,0,0.3)',
          }}
        >
          <span>✕ {toast}</span>
          <button
            onClick={() => setToast(null)}
            className="opacity-70 hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main chat area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <PersonaChatThread
            persona={persona}
            messages={messages}
            isLoading={isLoading}
            showTrait={showTrait}
            onSendSuggestion={handleSend}
            onFeedback={handleFeedback}
            onToggleTag={handleToggleTag}
            onRetry={handleRetry}
          />
          <PersonaChatComposer
            persona={persona}
            isLoading={isLoading}
            lastTrait={lastTrait}
            messageCount={messages.length}
            onSend={handleSend}
          />
        </div>

        {/* Profile rail — hidden below lg */}
        <div className="hidden lg:flex h-full overflow-hidden">
          <PersonaChatRail
            persona={persona}
            messages={messages}
            showTrait={showTrait}
            onToggleTrait={handleToggleTrait}
          />
        </div>
      </div>
    </div>
  );
}
