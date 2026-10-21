import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLoaderData, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { CanvasWorkspace } from '@/components/canvas/CanvasWorkspace';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/lib/api';
import { setPendingLeadToken } from '@/lib/leadToken';
import type { Persona } from '@/types';

/**
 * Raw persona shape from the public lead-set view (generator JSON — no DB ids,
 * arrays are plain strings, not the nested *_text rows of BackendPersona).
 */
type RawLeadPersona = {
  name: string;
  status: 'primary' | 'secondary';
  role: string;
  tech_comfort: 'low' | 'medium' | 'high';
  scenario_context?: string;
  demographics?: { age?: string; location?: string; education?: string; industry?: string };
  goals?: string[];
  frustrations?: string[];
  behavioral_patterns?: string[];
  influence_networks?: string[];
  recruitment_criteria?: string[];
  research_assumptions?: string[];
};

type LeadSetView = {
  state: 'generating' | 'ready' | 'claimed' | 'failed';
  product_description: string | null;
  personas: RawLeadPersona[] | null;
  persona_count: number;
  sign_in_cta: boolean;
};

function toPersona(p: RawLeadPersona, index: number): Persona {
  return {
    id: `lead-${index}`,
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
    goals: p.goals || [],
    frustrations: p.frustrations || [],
    behavioral_patterns: p.behavioral_patterns || [],
    influence_networks: p.influence_networks || [],
    recruitment_criteria: p.recruitment_criteria || [],
    research_assumptions: p.research_assumptions || [],
  };
}

function openAuth(token: string | undefined) {
  setPendingLeadToken(token ?? null);
  window.dispatchEvent(new CustomEvent('openAuthDialog'));
}



export function LeadSetPage() {
  const loaderData = useLoaderData() as LeadSetView | null;
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [view, setView] = useState<LeadSetView | null>(loaderData);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Already logged in: fire the explicit claim, then land in the conversation.
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.post(`/lead-sets/${token}/claim`);
        if (!cancelled && res.data?.conversation_id) {
          navigate('/', { state: { selectConversation: res.data.conversation_id } });
        }
      } catch {
        // 409 (claimed by someone else) or 404 — the view below handles it.
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, token, navigate]);

  // Poll while generating so the link goes live without a refresh.
  useEffect(() => {
    if (!view || view.state !== 'generating') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/lead-sets/${token}`);
        if (res.ok && !cancelledRef.current) setView(await res.json());
      } catch { /* retry next tick */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [view?.state, token]);

  const cancelledRef = useMemo(() => ({ current: false }), []);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  const personas = useMemo(
    () => (view?.personas || []).map(toPersona),
    [view?.personas]
  );

  const handleGated = useCallback(() => {
    if (isAuthenticated) return; // logged-in users get the claim effect above
    openAuth(token);
  }, [isAuthenticated, token]);


  const prompt = (
    <div className="max-w-md p-4 font-mono text-sm">
      <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Product idea</div>
      <div className="whitespace-pre-wrap">{view?.product_description || ''}</div>
      {view?.state === 'ready' && <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={handleGated}><Sparkles className="mr-1 h-3.5 w-3.5" />Chat with these personas</Button>
        <Button size="sm" variant="outline" onClick={handleGated}>Export</Button>
        <Button size="sm" variant="outline" onClick={handleGated}>Refine</Button>
      </div>}
    </div>
  );

  if (!view) {
    return <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Link not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This persona link is invalid or has expired.</p>
        <Link to="/" className="mt-4 inline-block"><Button variant="outline" size="sm">Go to PersonaForge</Button></Link>
      </div>
    </div>;
  }

  if (view.state === 'claimed') {
    return <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">These personas have been claimed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {view.persona_count} persona{view.persona_count === 1 ? '' : 's'} were generated for this idea and
          have already been claimed. Sign in to see them — or generate your own below.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {!isAuthenticated && <Button size="sm" onClick={() => openAuth(token)}>Sign in / Sign up</Button>}
          {isAuthenticated && <Button size="sm" onClick={() => navigate('/')}>Go to your workspace</Button>}
        </div>
      </div>
    </div>;
  }

  if (view.state === 'failed') {
    return <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Generation failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong preparing these personas.</p>
        <Link to="/" className="mt-4 inline-block"><Button variant="outline" size="sm">Generate your own</Button></Link>
      </div>
    </div>;
  }

  if (view.state === 'generating') {
    return <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Your personas are being forged…</h1>
        <p className="mt-2 text-sm text-muted-foreground">This usually takes a minute. The page will update automatically.</p>
      </div>
    </div>;
  }

  return <div className="relative min-h-screen">
    <Helmet>
      <title>Your personas — Persona Forge</title>
      <meta name="robots" content="noindex" />
    </Helmet>
    <CanvasWorkspace
      conversationId={null}
      personas={personas}
      prompt={prompt}
      messages={[]}
      isLoading={false}
      terminalOpen={false}
      onTerminalOpenChange={() => {}}
      onRefine={async () => { handleGated(); return false; }}
      sidebar={() => null}
      chromeRight={<ThemeToggle />}
      onUpdatePersona={handleGated}
      onDeletePersona={handleGated}
      onDuplicatePersona={handleGated}
      onChatPersona={handleGated}
      onNewIdea={() => navigate('/')}
      versions={[]}
      selectedVersionId={null}
      onSelectVersion={() => {}}
    />
  </div>;
}
