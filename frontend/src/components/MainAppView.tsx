import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Grip, X } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { isAxiosError } from 'axios';
import type { BackendPersona, GenerationMode, Persona, PersonaVersion, ProcessedFile, ThinkHardProgress } from '@/types';
import { useAppContext } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { usePersonaStore } from '@/stores/personaStore';
import { personaAPI, jobsAPI } from '@/lib/api';
import { SearchInterface } from '@/components/search/SearchInterface';
import { Sidebar } from '@/components/layout/Sidebar';
import { CanvasWorkspace } from '@/components/canvas/CanvasWorkspace';
import { PersonaChatPage } from '@/components/personaChat/PersonaChatPage';
import { PersonaChatSessionControls } from '@/components/personaChat/PersonaChatSessionControls';
import { UserStatus } from '@/components/auth/UserStatus';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThinkHardProgressView, parseJobEvent } from '@/components/ThinkHardProgress';

// Homepage-only SEO. Lives here (not in index.html) because vite-react-ssg copies the
// index.html <head> onto every pre-rendered page — a canonical there would leak onto
// blog posts and every other route. Title/description come from the layout Helmet (App.tsx).
const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://personaforge.pehloo.xyz';

const HOME_JSON_LD = {
  softwareApplication: {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Persona Forge',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description:
      'AI-powered user persona generator. Describe your product and get detailed, structured user personas in under 10 minutes.',
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Plus', price: '5', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Pro', price: '10', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Lifetime Plus', price: '200', priceCurrency: 'USD' },
    ],
    publisher: { '@type': 'Organization', name: 'Pehloo', url: 'https://pehloo.xyz' },
  },
  organization: {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Persona Forge',
    alternateName: 'Pehloo Persona Forge',
    url: SITE_URL,
    description: 'AI-powered user persona generation tool by Pehloo.',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'ribhu.lahiri@gmail.com',
      contactType: 'customer support',
    },
    parentOrganization: { '@type': 'Organization', name: 'Pehloo', url: 'https://pehloo.xyz' },
  },
};

function convertPersona(p: BackendPersona): Persona {
  const strings = (items: unknown, key: string): string[] => Array.isArray(items)
    ? items.map(item => typeof item === 'string' ? item : item && typeof item === 'object' && key in item ? String((item as Record<string, unknown>)[key]) : '').filter(Boolean)
    : [];
  return {
    id: String(p.id), name: p.name, status: p.status, role: p.role, tech_comfort: p.tech_comfort,
    scenario_context: p.scenario_context || '',
    demographics: { age: String(p.demographics?.age || ''), location: String(p.demographics?.location || ''), education: String(p.demographics?.education || ''), industry: String(p.demographics?.industry || '') },
    goals: strings(p.goals, 'goal_text'), frustrations: strings(p.frustrations, 'frustration_text'),
    behavioral_patterns: strings(p.behavioral_patterns, 'pattern_text'), influence_networks: strings(p.influence_networks, 'network_text'),
    recruitment_criteria: strings(p.recruitment_criteria, 'criteria_text'), research_assumptions: strings(p.research_assumptions, 'assumption_text'),
  };
}

type ChatGeometry = { x: number; y: number; width: number; height: number };

/** Clearance for the canvas header; the chat window must never sit above it. */
const CHAT_HEADER_CLEARANCE = 68;
const CHAT_VIEWPORT_MARGIN = 12;
const CHAT_MIN_W = 320;
const CHAT_MIN_H = 280;
/** How much of the window must stay on screen so the title bar is always reachable. */
const CHAT_KEEP_VISIBLE = 120;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function defaultChatGeometry(): ChatGeometry {
  if (typeof window === 'undefined') {
    return { x: 0, y: CHAT_HEADER_CLEARANCE, width: 900, height: 600 };
  }
  const width = clamp(
    Math.round(window.innerWidth * 0.7),
    CHAT_MIN_W,
    Math.max(CHAT_MIN_W, window.innerWidth - CHAT_VIEWPORT_MARGIN),
  );
  const height = clamp(
    Math.round(window.innerHeight * 0.78),
    CHAT_MIN_H,
    Math.max(CHAT_MIN_H, window.innerHeight - CHAT_HEADER_CLEARANCE - CHAT_VIEWPORT_MARGIN),
  );
  return {
    x: Math.round((window.innerWidth - width) / 2),
    y: CHAT_HEADER_CLEARANCE + Math.round((window.innerHeight - CHAT_HEADER_CLEARANCE - CHAT_VIEWPORT_MARGIN - height) / 2),
    width,
    height,
  };
}

export function MainAppView() {
  const { onLogin } = useAppContext();
  const navigate = useNavigate();
  const { personas, setPersonas, updatePersona, deletePersona, addPersona, clearAll } = usePersonaStore();
  const {
    createConversation,
    sendMessage,
    selectConversation,
    messages,
    currentConversationId,
    isLoading,
    error,
  } = useChatStore();
  const { isAuthenticated } = useAuthStore();
  const [versions, setVersions] = useState<PersonaVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [chatPersona, setChatPersona] = useState<Persona | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const prevMessagesLength = useRef(0);
  /** null = follow the responsive default until the user drags or resizes. */
  const [chatGeometry, setChatGeometry] = useState<ChatGeometry | null>(null);
  const [chatInteraction, setChatInteraction] = useState<'drag' | 'resize' | null>(null);
  const chatDragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const chatResizeRef = useRef<{ x: number; y: number; ow: number; oh: number } | null>(null);

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
      const nextVersions: PersonaVersion[] = messages.filter(message => message.personas?.length).map(message => ({
        id: String(message.id), timestamp: new Date(message.created_at), personas: (message.personas ?? []).map(convertPersona),
      }));
      setVersions(nextVersions);
      const hasNewMessages = messages.length > prevMessagesLength.current;
      prevMessagesLength.current = messages.length;
      if (nextVersions.length) {
        const latest = nextVersions[nextVersions.length - 1].id;
        if (hasNewMessages || !selectedVersionId || !nextVersions.some(version => version.id === selectedVersionId)) setSelectedVersionId(latest);
      } else setPersonas([]);
    } else {
      setVersions([]);
      setPersonas([]);
    }
  }, [messages, currentConversationId, selectedVersionId, setPersonas]);

  useEffect(() => {
    if (!versions.length) return;
    const selected = versions.find(version => version.id === selectedVersionId) ?? versions[versions.length - 1];
    setPersonas(selected.personas);
  }, [versions, selectedVersionId, setPersonas]);

  const handleSearch = async (data: { text: string; mode: GenerationMode; files: ProcessedFile[]; fileId?: string }) => {
    if (!isAuthenticated) { onLogin(); return; }
    setTerminalOpen(true);
    try {
      if (!useChatStore.getState().currentConversationId) await createConversation(data.text);

      if (data.mode === 'think_hard') {
        // ── Think Hard: create a job and stream events ──
        const conversationId = useChatStore.getState().currentConversationId;
        if (!conversationId) throw new Error('No conversation to attach the job to');
        setThinkHardProgress({ stage: 'queued', message: 'Creating job...', isTerminal: false });

        try {
          // One key per user send attempt — backend dedups duplicate submissions
          const idempotencyKey = crypto.randomUUID();
          const job = await jobsAPI.createJob(conversationId, {
            text: data.text,
            mode: 'think_hard',
            file_id: data.fileId,
            idempotency_key: idempotencyKey,
          });

          // Fetch messages to get the pending assistant message
          await selectConversation(conversationId);

          // Subscribe to SSE events
          sseClientRef.current?.close();
          const sseClient = jobsAPI.streamJobEvents(conversationId, job.id, {
            onEvent: (event) => {
              if (event.event && event.data) {
                const progress = parseJobEvent(event.event, event.data);
                setThinkHardProgress(progress);

                if (progress.isTerminal) {
                  // On terminal, fetch messages to get the final personas
                  setTimeout(() => {
                    selectConversation(conversationId);
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
        } catch (err) {
          // 402 means the plan quota is exhausted; every other failure rethrows to the outer
          // handler. `isAxiosError` narrows `unknown` without an unchecked cast.
          if (isAxiosError(err) && err.response?.status === 402) {
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
    } catch (err) {
      console.error('Failed to generate personas:', err);
      setThinkHardProgress(null);
    }
  };

  const handleUpdatePersona = async (id: string, updates: Partial<Persona>) => {
    const original = personas.find(persona => String(persona.id) === id);
    updatePersona(id, updates);
    if (id.startsWith('persona-')) return;
    try { await personaAPI.updatePersona(id, updates); }
    catch (err) { console.error('Failed to update persona:', err); if (original) updatePersona(id, original); }
  };

  const handleDuplicatePersona = (persona: Persona) => addPersona({ ...persona, id: `persona-${Date.now()}-duplicate`, name: `${persona.name} (Copy)` });
  const handleClear = () => {
    useChatStore.getState().clearCurrentConversation();
    clearAll();
    setVersions([]);
    setChatPersona(null);
    setTerminalOpen(false);
    setThinkHardProgress(null);
    sseClientRef.current?.close();
  };

  const prompt = <SearchInterface onSubmit={handleSearch} isLoading={isLoading} variant="landing" />;

  const floatingSidebar = (onSelectIdea: () => void) => <Sidebar onLoginClick={onLogin} onSelectIdea={() => { setTerminalOpen(false); setChatPersona(null); onSelectIdea(); }} className="!h-full !w-full !border-0" />;

  const chatBox = chatGeometry ?? defaultChatGeometry();

  const handleChatDragStart = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    chatDragRef.current = { x: event.clientX, y: event.clientY, ox: chatBox.x, oy: chatBox.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setChatInteraction('drag');
  };

  const handleChatDragMove = (event: React.PointerEvent) => {
    const drag = chatDragRef.current;
    if (!drag) return;
    const { width, height } = chatBox;
    // Keep the title bar and the bottom-right resize handle on screen: the window may hang off
    // the top-left, but its right and bottom edges stay inside the viewport.
    const minX = Math.min(CHAT_KEEP_VISIBLE - width, CHAT_VIEWPORT_MARGIN);
    const minY = Math.min(CHAT_HEADER_CLEARANCE, window.innerHeight - CHAT_VIEWPORT_MARGIN - height);
    setChatGeometry({
      ...chatBox,
      x: clamp(drag.ox + event.clientX - drag.x, minX, Math.max(minX, window.innerWidth - CHAT_VIEWPORT_MARGIN - width)),
      y: clamp(drag.oy + event.clientY - drag.y, minY, Math.max(minY, window.innerHeight - CHAT_VIEWPORT_MARGIN - height)),
    });
  };

  const endChatInteraction = () => {
    chatDragRef.current = null;
    chatResizeRef.current = null;
    setChatInteraction(null);
  };

  const handleChatResizeStart = (event: React.PointerEvent) => {
    chatResizeRef.current = { x: event.clientX, y: event.clientY, ow: chatBox.width, oh: chatBox.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    setChatInteraction('resize');
  };

  const handleChatResizeMove = (event: React.PointerEvent) => {
    const resize = chatResizeRef.current;
    if (!resize) return;
    const width = clamp(
      resize.ow + event.clientX - resize.x,
      CHAT_MIN_W,
      Math.max(CHAT_MIN_W, window.innerWidth - 2 * CHAT_VIEWPORT_MARGIN),
    );
    const height = clamp(
      resize.oh + event.clientY - resize.y,
      CHAT_MIN_H,
      Math.max(CHAT_MIN_H, window.innerHeight - CHAT_HEADER_CLEARANCE - CHAT_VIEWPORT_MARGIN),
    );
    // Growing from the bottom-right corner would run off the edge when the window is already
    // flush against it, so nudge the window back inside instead of refusing to grow.
    setChatGeometry({
      width,
      height,
      x: Math.min(chatBox.x, window.innerWidth - CHAT_VIEWPORT_MARGIN - width),
      y: Math.min(chatBox.y, window.innerHeight - CHAT_VIEWPORT_MARGIN - height),
    });
  };

  const chatTarget = chatPersona && personas.find(persona => String(persona.id) === String(chatPersona.id)) || chatPersona;

  return <ErrorBoundary><div className="relative min-h-screen">
    <Helmet>
      <link rel="canonical" href={`${SITE_URL}/`} />
      <meta property="og:title" content="Persona Forge — AI User Persona Generator by Pehloo" />
      <meta property="og:description" content="Generate detailed AI-powered user personas from any product description in under 10 minutes." />
      <meta property="og:url" content={`${SITE_URL}/`} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={`${SITE_URL}/og-image.png`} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Persona Forge — AI User Persona Generator" />
      <meta name="twitter:description" content="Generate detailed AI-powered user personas from any product description in under 10 minutes." />
      <meta name="twitter:image" content={`${SITE_URL}/og-image.png`} />
    </Helmet>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD.softwareApplication) }}
    />
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD.organization) }}
    />
    <div className="md:hidden absolute top-0 left-0 right-0 z-[60] bg-yellow-50 border-b border-yellow-200 text-yellow-900 text-xs text-center px-4 py-2 font-medium">
      For the best experience, please use PersonaForge on a desktop.
    </div>
    <CanvasWorkspace
      conversationId={currentConversationId}
      personas={personas}
      prompt={prompt}
      messages={messages}
      isLoading={isLoading}
      terminalOpen={terminalOpen}
      onTerminalOpenChange={setTerminalOpen}
      onRefine={handleSearch}
      sidebar={floatingSidebar}
      chromeRight={<>
        <Link to="/blog" className="hidden md:block"><Button variant="ghost" size="sm" className="h-8 px-2 text-xs">Blog</Button></Link>
        <Link to="/pricing" className="hidden md:block"><Button variant="ghost" size="sm" className="h-8 px-2 text-xs">Pricing</Button></Link>
        <ThemeToggle />
        <UserStatus onLoginClick={onLogin} />
      </>}
      onUpdatePersona={handleUpdatePersona}
      onDeletePersona={deletePersona}
      onDuplicatePersona={handleDuplicatePersona}
      onChatPersona={persona => { setChatPersona(persona); setChatGeometry(null); }}
      chatOpen={!!chatPersona}
      onNewIdea={handleClear}
      versions={versions}
      selectedVersionId={selectedVersionId}
      onSelectVersion={setSelectedVersionId}
    />
    {error && <div className="absolute bottom-20 left-1/2 z-[70] max-w-lg -translate-x-1/2 border-2 border-red-800 bg-red-950/70 px-4 py-3 text-sm text-red-200 shadow-[5px_5px_0_hsl(var(--foreground)/0.7)]">{error}</div>}
    {/* Think Hard reports stage progress here rather than in a second panel: the canvas is the
        whole surface now, and the terminal already shows the quick-mode spinner. */}
    {thinkHardProgress && <div className="absolute bottom-20 left-1/2 z-[65] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2">
      <ThinkHardProgressView progress={thinkHardProgress} />
    </div>}
    {chatTarget && <section
      className={`absolute z-[60] flex min-h-0 min-w-0 flex-col overflow-hidden border-2 border-border bg-background shadow-[8px_8px_0_hsl(var(--foreground)/0.75)]${chatInteraction ? ' select-none' : ''}`}
      style={{ left: chatBox.x, top: chatBox.y, width: chatBox.width, height: chatBox.height }}
      aria-label={`Interview with ${chatTarget.name}`}
    >
      <div className="flex h-10 shrink-0 cursor-move touch-none select-none items-center justify-between gap-3 border-b-2 border-border bg-muted/50 px-3 font-mono text-[11px] text-muted-foreground" onPointerDown={handleChatDragStart} onPointerMove={handleChatDragMove} onPointerUp={endChatInteraction} onPointerCancel={endChatInteraction}>
        <span className="inline-flex min-w-0 items-center gap-2"><Grip className="h-3.5 w-3.5 shrink-0" /><span className="truncate uppercase tracking-[0.12em]">Interview · {chatTarget.name}</span></span>
        <span className="flex shrink-0 items-center gap-2">
          <PersonaChatSessionControls personaId={Number(chatTarget.id)} personaName={chatTarget.name} />
          <button className="p-1 transition-colors hover:bg-accent hover:text-foreground" aria-label="Close chat" onClick={() => setChatPersona(null)}><X className="h-3.5 w-3.5" /></button>
        </span>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden"><PersonaChatPage embedded personaId={String(chatTarget.id)} onClose={() => setChatPersona(null)} /></div>
      <button
        type="button"
        aria-label="Resize chat window"
        title="Resize"
        onPointerDown={handleChatResizeStart}
        onPointerMove={handleChatResizeMove}
        onPointerUp={endChatInteraction}
        onPointerCancel={endChatInteraction}
        className="absolute bottom-0 right-0 z-10 flex h-4 w-4 cursor-se-resize touch-none items-end justify-end p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
      >
        <svg viewBox="0 0 10 10" className="h-full w-full" aria-hidden="true">
          <path d="M9 2v7H2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 6v3H6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </section>}
  </div></ErrorBoundary>;
}
