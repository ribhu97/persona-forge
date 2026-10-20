import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, Download, FileText, History, Lightbulb, Maximize, MessageCircle, Minus, Plus, RotateCcw, Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PersonaCard } from '@/components/persona/PersonaCard';
import { ExportDialog } from '@/components/persona/ExportDialog';
import { cn } from '@/lib/utils';
import type { GenerationMode, Message, Persona, PersonaVersion, ProcessedFile } from '@/types';
import { SearchInterface } from '@/components/search/SearchInterface';
import { FaceGrid } from '@/components/canvas/FaceGrid';

type Point = { x: number; y: number };
type Viewport = { x: number; y: number; zoom: number };
type BoardState = { positions: Record<string, Point>; viewport: Viewport };

interface Props {
  conversationId: number | null;
  personas: Persona[];
  prompt: React.ReactNode;
  messages: Message[];
  isLoading: boolean;
  terminalOpen: boolean;
  onTerminalOpenChange: (open: boolean) => void;
  onRefine: (data: { text: string; mode: GenerationMode; files: ProcessedFile[]; fileId?: string }) => Promise<boolean>;
  sidebar: (onSelectIdea: () => void) => React.ReactNode;
  chromeRight?: React.ReactNode;
  onUpdatePersona: (id: string, updates: Partial<Persona>) => void;
  onDeletePersona: (id: string) => void;
  onDuplicatePersona: (persona: Persona) => void;
  onChatPersona: (persona: Persona) => void;
  chatOpen?: boolean;
  onNewIdea: () => void;
  versions: PersonaVersion[];
  selectedVersionId: string | null;
  onSelectVersion: (id: string) => void;
}

const CARD_W = 340;
const CARD_H = 190;
/** Vertical pitch between card rows: CARD_H plus breathing room, since cards grow with content. */
const CARD_ROW_H = 232;
const CARD_GAP_X = 56;
const CARDS_PER_ROW = 3;

/** The idea card is a fixed box so the arrangement around it is deterministic. */
const IDEA_W = 600;
const IDEA_H = 220;
const IDEA_TOP = -IDEA_H / 2;
/** Vertical clearance between the idea card and the first row of personas. */
const IDEA_GAP = 110;

/**
 * Primary personas stack upward from the idea, secondary personas stack downward, both centred
 * on the idea. Deterministic, so a fresh generation reads as "these matter most" rather than as
 * cards landing wherever there is room.
 */
function layoutPositions(personas: Persona[]): Record<string, Point> {
  const positions: Record<string, Point> = {};
  const place = (group: Persona[], above: boolean) => {
    group.forEach((persona, index) => {
      const row = Math.floor(index / CARDS_PER_ROW);
      const column = index % CARDS_PER_ROW;
      const inRow = Math.min(CARDS_PER_ROW, group.length - row * CARDS_PER_ROW);
      const rowWidth = inRow * CARD_W + (inRow - 1) * CARD_GAP_X;
      const offset = IDEA_GAP + row * CARD_ROW_H;
      positions[String(persona.id)] = {
        x: -rowWidth / 2 + column * (CARD_W + CARD_GAP_X),
        y: above ? IDEA_TOP - offset - CARD_H : IDEA_TOP + IDEA_H + offset,
      };
    });
  };
  place(personas.filter(persona => persona.status === 'primary'), true);
  place(personas.filter(persona => persona.status !== 'primary'), false);
  return positions;
}

type BoardBounds = { minX: number; maxX: number; minY: number; maxY: number };

/** Board-space extent of the idea card plus every placed persona. */
function boardBounds(positions: Record<string, Point>): BoardBounds {
  const xs = [-IDEA_W / 2, IDEA_W / 2];
  const ys = [IDEA_TOP, IDEA_TOP + IDEA_H];
  Object.values(positions).forEach(position => {
    xs.push(position.x, position.x + CARD_W);
    ys.push(position.y, position.y + CARD_H);
  });
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function fitViewport(bounds: BoardBounds, width: number, height: number, maxZoom = 1.4): Viewport {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = Math.max(0.35, Math.min(maxZoom, (width - 120) / spanX, (height - 150) / spanY));
  return {
    x: -((bounds.minX + bounds.maxX) / 2) * zoom,
    y: -((bounds.minY + bounds.maxY) / 2) * zoom,
    zoom,
  };
}

function storageKey(conversationId: number | null) {
  return `personaforge-canvas-v1:${conversationId ?? 'new'}`;
}

/** Returned whenever stored state is missing or unusable. Never mutated — every update spreads. */
const EMPTY_BOARD: BoardState = { positions: {}, viewport: { x: 0, y: 0, zoom: 1 } };

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  if (!('x' in value) || !('y' in value)) return false;
  return typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y);
}

/**
 * The board is persisted as JSON, so it can come back as `{}`, `null`, or a shape written by an
 * older build. The canvas is the whole surface, so an unvalidated read here is a white screen
 * until the user clears storage — validate every field and fall back to a fresh board.
 */
function readLayout(key: string): BoardState {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return EMPTY_BOARD;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return EMPTY_BOARD;
    if (!('viewport' in parsed) || !('positions' in parsed)) return EMPTY_BOARD;

    const { viewport, positions } = parsed;
    if (!viewport || typeof viewport !== 'object') return EMPTY_BOARD;
    if (!('x' in viewport) || !('y' in viewport) || !('zoom' in viewport)) return EMPTY_BOARD;

    const { x, y, zoom } = viewport;
    if (typeof x !== 'number' || !Number.isFinite(x)) return EMPTY_BOARD;
    if (typeof y !== 'number' || !Number.isFinite(y)) return EMPTY_BOARD;
    if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom <= 0) return EMPTY_BOARD;

    if (!positions || typeof positions !== 'object') return EMPTY_BOARD;
    const usablePositions: Record<string, Point> = {};
    for (const [id, point] of Object.entries(positions)) {
      if (isPoint(point)) usablePositions[id] = point;
    }
    return { positions: usablePositions, viewport: { x, y, zoom } };
  } catch {
    return EMPTY_BOARD;
  }
}

/**
 * Lines from each persona card to the idea it was derived from. Rendered behind the cards, in
 * board coordinates, so it pans and zooms with them.
 */
function CardConnectors({ personas, positions }: { personas: Persona[]; positions: Record<string, Point> }) {
  if (personas.length === 0) return null;
  const bounds = boardBounds(positions);
  const pad = 40;
  const left = bounds.minX - pad;
  const top = bounds.minY - pad;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;

  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left, top }}
      width={width}
      height={height}
      viewBox={`${left} ${top} ${width} ${height}`}
      aria-hidden="true"
    >
      {personas.map(persona => {
        const position = positions[String(persona.id)];
        if (!position) return null;
        const above = persona.status === 'primary';
        return (
          <line
            key={persona.id}
            x1={0}
            y1={above ? IDEA_TOP : IDEA_TOP + IDEA_H}
            x2={position.x + CARD_W / 2}
            y2={above ? position.y + CARD_H : position.y}
            stroke="hsl(var(--foreground) / 0.22)"
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}

function ShiftingFaces() {
  const faces = ['👩🏽', '🧑🏻', '👨🏾', '👩🏻‍💻', '🧔🏼', '👨🏻‍🦱'];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setFrame(value => (value + 1) % faces.length), 420);
    return () => window.clearInterval(timer);
  }, [faces.length]);
  return <div className="flex items-center gap-3 border border-border bg-muted/40 px-3 py-2.5" aria-live="polite">
    <div className="flex -space-x-2" aria-hidden="true">
      {[0, 1, 2, 3].map((offset, index) => <span key={index} className="flex h-8 w-8 items-center justify-center rounded-none border-2 border-card bg-card text-lg transition-transform duration-300" style={{ transform: `translateY(${(frame + index) % 2 ? -3 : 3}px) rotate(${(frame + index) % 3 - 1}deg)` }}>{faces[(frame + offset) % faces.length]}</span>)}
    </div>
    <span className="text-xs font-medium text-muted-foreground">{frame % 2 ? 'Shifting personas…' : 'Reworking the persona set…'}</span>
  </div>;
}

export function CanvasWorkspace({ conversationId, personas, prompt, messages, isLoading, terminalOpen, onTerminalOpenChange, onRefine, sidebar, chromeRight, onUpdatePersona, onDeletePersona, onDuplicatePersona, onChatPersona, chatOpen = false, onNewIdea, versions, selectedVersionId, onSelectVersion }: Props) {
  const key = storageKey(conversationId);
  const [board, setBoard] = useState(() => readLayout(key));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [draggingCard, setDraggingCard] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ id: number; start: Point; origin: Point; mode: 'pan' | 'card'; personaId?: string } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    setBoard(readLayout(key));
    setSelectedId(null);
  }, [key]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(board)); } catch { /* persistence is best-effort */ }
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [board, key]);

  useEffect(() => {
    setBoard(current => {
      const fresh = layoutPositions(personas);
      // A new generation re-arranges; a drag only ever repositions, never adds. The first
      // arrangement also frames the board so the primary/secondary split is visible immediately.
      const isNewArrangement = personas.some(persona => !current.positions[String(persona.id)]);
      const positions = isNewArrangement ? { ...current.positions, ...fresh } : current.positions;
      const bounds = viewportRef.current?.getBoundingClientRect();
      return {
        ...current,
        positions,
        // Frame the board whenever the arrangement changes, so a fresh generation is always
        // shown in place instead of landing off-screen.
        viewport: isNewArrangement && bounds
          ? fitViewport(boardBounds(positions), bounds.width, bounds.height, 1)
          : current.viewport,
      };
    });
  }, [personas]);

  const selectedPersona = useMemo(() => personas.find(persona => String(persona.id) === selectedId) ?? null, [personas, selectedId]);
  /** Persisted positions win, but a persona added since the last arrange still needs a slot. */
  const boardPositions = useMemo(
    () => ({ ...layoutPositions(personas), ...board.positions }),
    [personas, board.positions],
  );
  const initialPrompt = messages.find(message => message.role === 'user');
  const initialResponseIndex = initialPrompt ? messages.indexOf(initialPrompt) + 1 : -1;
  const initialResponse = initialResponseIndex >= 0 ? messages[initialResponseIndex] : undefined;
  const initialAttachment = initialResponse?.role === 'assistant' ? initialResponse.attachment : undefined;
  const sentMessages = messages.filter(message => message.role === 'user');

  const beginPointer = (event: React.PointerEvent, mode: 'pan' | 'card', personaId?: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointerRef.current = {
      id: event.pointerId,
      start: point,
      origin: mode === 'pan' ? { x: board.viewport.x, y: board.viewport.y } : { ...(board.positions[personaId!] ?? { x: 0, y: 0 }) },
      mode,
      personaId,
    };
    movedRef.current = false;
    if (mode === 'card') {
      setSelectedId(personaId!);
      setDraggingCard(personaId!);
    }
  };

  const movePointer = (event: React.PointerEvent) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.start.x;
    const dy = event.clientY - pointer.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
    if (pointer.mode === 'pan') {
      setBoard(current => ({ ...current, viewport: { ...current.viewport, x: pointer.origin.x + dx, y: pointer.origin.y + dy } }));
    } else if (pointer.personaId) {
      setBoard(current => ({ ...current, positions: { ...current.positions, [pointer.personaId!]: { x: pointer.origin.x + dx / current.viewport.zoom, y: pointer.origin.y + dy / current.viewport.zoom } } }));
    }
  };

  const endPointer = (event: React.PointerEvent) => {
    if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
    setDraggingCard(null);
  };

  const changeZoom = useCallback((delta: number, anchor?: Point) => {
    setBoard(current => {
      const zoom = Math.max(0.35, Math.min(1.8, current.viewport.zoom + delta));
      if (anchor && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const cx = anchor.x - rect.left - rect.width / 2;
        const cy = anchor.y - rect.top - rect.height / 2;
        const ratio = zoom / current.viewport.zoom;
        return { ...current, viewport: { x: cx - (cx - current.viewport.x) * ratio, y: cy - (cy - current.viewport.y) * ratio, zoom } };
      }
      return { ...current, viewport: { ...current.viewport, zoom } };
    });
  }, []);

  const fitBoard = () => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds || personas.length === 0) {
      setBoard(current => ({ ...current, viewport: { x: 0, y: 0, zoom: 1 } }));
      return;
    }
    const extent = boardBounds(boardPositions);
    setBoard(current => ({ ...current, viewport: fitViewport(extent, bounds.width, bounds.height) }));
  };

  const resetBoard = () => setBoard(current => ({ ...current, viewport: { x: 0, y: 0, zoom: 1 } }));

  // React attaches wheel listeners at the root as passive, so `preventDefault()` in an onWheel
  // prop is a no-op: Ctrl/Cmd+scroll and trackpad pinch would zoom the page and the canvas at
  // once. A native listener with { passive: false } is the only way to claim the gesture.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 0.08 : -0.08, { x: event.clientX, y: event.clientY });
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [changeZoom]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div
        ref={viewportRef}
        className={cn('absolute inset-0 overflow-hidden bg-background', draggingCard ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={event => {
          if (!(event.target as HTMLElement).closest('[data-canvas-interactive]')) beginPointer(event, 'pan');
        }}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 touch-none overflow-hidden bg-background">
          {/* Oversized by 15% a side so the parallax translate never exposes an edge. */}
          <div
            className="absolute -inset-[15%]"
            style={{ transform: `translate(${board.viewport.x * 0.18}px, ${board.viewport.y * 0.18}px)` }}
          >
            <FaceGrid processing={isLoading} />
          </div>
        </div>
        <div className="absolute left-1/2 top-1/2 origin-center" style={{ transform: `translate(calc(-50% + ${board.viewport.x}px), calc(-50% + ${board.viewport.y}px)) scale(${board.viewport.zoom})` }}>
          <CardConnectors personas={personas} positions={boardPositions} />
          {/* Fixed box while it holds a stored prompt: the connectors attach to its exact edges, and
              a stable size keeps the board geometry deterministic. The landing composer sizes to
              its own content instead, so it is centred with a transform. */}
          <div
            data-canvas-interactive
            className="absolute flex flex-col border-2 border-border bg-card p-5 shadow-[6px_6px_0_hsl(var(--foreground)/0.8)] cursor-auto"
            style={conversationId
              ? { left: -IDEA_W / 2, top: IDEA_TOP, width: IDEA_W, height: IDEA_H }
              : { left: -IDEA_W / 2, top: 0, width: IDEA_W, transform: 'translateY(-50%)' }}
            onPointerDown={event => event.stopPropagation()}
          >
            {conversationId ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="shrink-0 border-b border-border pb-3">
                  <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Idea</div>
                  <div className="mt-1 text-sm font-semibold">Your starting point</div>
                </div>
                <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{initialPrompt?.content ?? (isLoading ? 'Loading idea…' : 'No prompt found for this idea.')}</p>
                {initialAttachment && <div className="flex min-w-0 shrink-0 items-center gap-2 rounded-none bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{initialAttachment.filename}</span><span className="ml-auto shrink-0">Attached</span></div>}
              </div>
            ) : prompt}
          </div>

          {personas.map(persona => {
            const id = String(persona.id);
            const position = boardPositions[id] ?? layoutPositions(personas)[id];
            return (
              <button
                key={id}
                data-canvas-interactive
                type="button"
                onPointerDown={event => { event.stopPropagation(); beginPointer(event, 'card', id); }}
                onPointerMove={movePointer}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
                onClick={() => { if (!movedRef.current) setSelectedId(id); }}
                className={cn('absolute w-[340px] min-h-[190px] select-none border-2 bg-card p-5 text-left text-card-foreground shadow-[5px_5px_0_hsl(var(--foreground)/0.72)] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 cursor-grab', selectedId === id ? 'border-primary ring-2 ring-primary/20' : 'border-border', draggingCard === id && 'z-20 cursor-grabbing')}
                style={{ left: position.x, top: position.y }}
              >
                <div className="flex items-start gap-3">
                  <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-none', persona.status === 'primary' ? 'bg-blue-500' : 'bg-violet-500')} />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-words text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{persona.name}</div>
                    <div className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{persona.role}</div>
                  </div>
                  <span className="rounded-none bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{persona.status}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="min-w-0"><span className="block text-muted-foreground">AGE</span><span className="block truncate">{persona.demographics.age || '—'}</span></div>
                  <div className="min-w-0"><span className="block text-muted-foreground">LOCATION</span><span className="block truncate">{persona.demographics.location || '—'}</span></div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>{persona.goals.length} goals · {persona.frustrations.length} frustrations</span>
                  <span className="inline-flex items-center gap-1 text-foreground"><ArrowUpRight className="h-3.5 w-3.5" /> View details</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Layer ladder: content 0 · dragging card / dock / footer nav 20 · header 30 ·
          panel scrims 40 · panels 50 · chat window 60 · toasts 70 · dialogs 80.
          The header must be opaque so board content panned under it is occluded, not ghosted. */}
      <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b-2 border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(v => !v)} aria-label="Open ideas" title="Ideas"><Lightbulb className="h-4 w-4" /></Button>
          <span className="hidden font-display text-lg tracking-tight sm:inline">PERSONA FORGE</span>
          {personas.length > 0 && <span className="hidden bg-muted px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">{personas.length} personas</span>}
        </div>
        <div className="flex items-center gap-2">
          {conversationId && personas.length > 0 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsExportOpen(true)} aria-label="Export personas" title="Export"><Download className="h-4 w-4" /></Button>}
          {chromeRight}
        </div>
      </header>

      {sidebarOpen && <>
        <button className="absolute inset-0 z-40 bg-black/10" aria-label="Close ideas" onClick={() => setSidebarOpen(false)} />
        <div className="absolute bottom-4 left-4 top-[4.5rem] z-50 w-[min(300px,calc(100vw-2rem))] overflow-hidden border-2 border-border bg-card shadow-[8px_8px_0_hsl(var(--foreground)/0.8)]">{sidebar(() => { setSidebarOpen(false); setHistoryOpen(false); })}</div>
      </>}

      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center border-2 border-border bg-card p-1.5 shadow-[5px_5px_0_hsl(var(--foreground)/0.8)]">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={onNewIdea} aria-label="New idea" title="New idea"><Lightbulb className="h-4 w-4" /><Plus className="h-2.5 w-2.5" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className={cn('h-9 w-9 rounded-none', terminalOpen && 'bg-muted text-foreground')} onClick={() => onTerminalOpenChange(!terminalOpen)} disabled={!conversationId} aria-label="Open prompt terminal" title="Refine idea"><Terminal className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={() => changeZoom(-0.1)} aria-label="Zoom out"><Minus className="h-4 w-4" /></Button>
        <button className="min-w-14 px-1 text-center text-xs tabular-nums text-muted-foreground" onClick={fitBoard}>{Math.round(board.viewport.zoom * 100)}%</button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={() => changeZoom(0.1)} aria-label="Zoom in"><Plus className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={fitBoard} aria-label="Fit canvas"><Maximize className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={resetBoard} aria-label="Reset view"><RotateCcw className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className={cn('h-9 w-9 rounded-none', historyOpen && 'bg-muted text-foreground')} onClick={() => { setHistoryOpen(value => !value); setSelectedId(null); }} aria-label="Open prompt history" title="History"><History className="h-4 w-4" /></Button>
      </div>

      {terminalOpen && conversationId && <div data-canvas-interactive className="absolute bottom-[5.25rem] left-1/2 z-50 flex max-h-[min(70vh,620px)] w-[min(720px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden border-2 border-border bg-card shadow-[8px_8px_0_hsl(var(--foreground)/0.8)]" onPointerDown={event => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><Terminal className="h-3.5 w-3.5" />Refine the idea</div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onTerminalOpenChange(false)} aria-label="Close prompt terminal"><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isLoading && <div className="mb-3"><ShiftingFaces /></div>}
          <SearchInterface onSubmit={onRefine} isLoading={isLoading} variant="panel" onEscape={() => onTerminalOpenChange(false)} />
        </div>
      </div>}

      {historyOpen && <>
        <button className="absolute inset-0 z-40 bg-black/10" aria-label="Close history" onClick={() => setHistoryOpen(false)} />
        <aside className="absolute bottom-4 right-4 top-[4.5rem] z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden border-2 border-border bg-card shadow-[8px_8px_0_hsl(var(--foreground)/0.8)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><h2 className="text-sm font-semibold">Prompt history</h2><p className="text-xs text-muted-foreground">{sentMessages.length} prompts in this idea</p></div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setHistoryOpen(false)} aria-label="Close history panel"><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {sentMessages.length === 0 ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">Prompts will appear here as you refine this idea.</p> : sentMessages.map((message, index) => {
              const messageIndex = messages.indexOf(message);
              const response = messages[messageIndex + 1];
              const attachment = response?.role === 'assistant' ? response.attachment : undefined;
              return <article key={message.id} className="border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="font-medium uppercase tracking-wider">Prompt {index + 1}</span><span className="inline-flex shrink-0 items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(message.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{message.content}</p>
                {attachment && <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{attachment.filename}</span></div>}
              </article>;
            })}
          </div>
        </aside>
      </>}

      <nav className="absolute bottom-5 right-5 z-20 hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
        <a href="/privacy" className="hover:text-foreground">Privacy</a>
        <a href="/terms" className="hover:text-foreground">Terms</a>
        <a href="mailto:ribhu.lahiri@gmail.com" className="hover:text-foreground">Contact</a>
      </nav>

      {selectedPersona && !chatOpen && <aside className="absolute bottom-4 right-4 top-[4.5rem] z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden border-2 border-border bg-card shadow-[8px_8px_0_hsl(var(--foreground)/0.8)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Persona details</div>
            {versions.length > 1 && <select className="mt-1 bg-transparent text-xs text-muted-foreground outline-none" value={selectedVersionId ?? ''} onChange={event => onSelectVersion(event.target.value)}>{versions.map((version, index) => <option key={version.id} value={version.id}>Version {index + 1}</option>)}</select>}
          </div>
          <div className="flex items-center gap-1">
            {/* Duplicated personas carry a synthetic `persona-<ts>-duplicate` id, which has no
                backend record — the interview would load a NaN persona id and error out. */}
            {Number.isFinite(Number(selectedPersona.id)) && (
              <Button variant="outline" size="sm" onClick={() => onChatPersona(selectedPersona)} className="h-8 rounded-none"><MessageCircle className="mr-2 h-4 w-4" />Chat</Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedId(null)} aria-label="Close inspector"><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <PersonaCard persona={selectedPersona} onUpdate={onUpdatePersona} onDelete={id => { onDeletePersona(id); setSelectedId(null); }} onDuplicate={onDuplicatePersona} />
        </div>
      </aside>}

      <ExportDialog open={isExportOpen} onOpenChange={setIsExportOpen} personas={personas} />
    </div>
  );
}
