import { create } from 'zustand';
import { personaChatAPI } from '@/lib/api';
import type { AppError } from '@/lib/api';
import type { PersonaChatMessage, PersonaChatSessionState, TagType } from '@/types/chat';

interface PersonaChatStore {
  sessions: Record<number, PersonaChatSessionState>;
  activePersonaId: number | null;

  setActivePersona: (personaId: number) => void;
  loadSession: (personaId: number) => Promise<void>;
  sendMessage: (personaId: number, content: string) => Promise<void>;
  clearSession: (personaId: number) => Promise<void>;
  setFeedback: (personaId: number, messageId: number, value: 'up' | 'down' | null) => Promise<void>;
  toggleTag: (personaId: number, messageId: number, tag: TagType) => Promise<void>;
}

function emptySession(personaId: number): PersonaChatSessionState {
  return { personaId, messages: [], isLoading: false, error: null, errorType: null };
}

function getOrInit(
  sessions: Record<number, PersonaChatSessionState>,
  personaId: number
): PersonaChatSessionState {
  return sessions[personaId] ?? emptySession(personaId);
}

export const usePersonaChatStore = create<PersonaChatStore>((set, get) => ({
  sessions: {},
  activePersonaId: null,

  setActivePersona: (personaId) => set({ activePersonaId: personaId }),

  loadSession: async (personaId) => {
    const session = getOrInit(get().sessions, personaId);
    if (session.isLoading) return;

    set(s => ({
      sessions: {
        ...s.sessions,
        [personaId]: { ...getOrInit(s.sessions, personaId), isLoading: true, error: null, errorType: null },
      },
    }));

    try {
      const messages: PersonaChatMessage[] = await personaChatAPI.getMessages(personaId);
      set(s => ({
        sessions: {
          ...s.sessions,
          [personaId]: { ...getOrInit(s.sessions, personaId), messages, isLoading: false },
        },
      }));
    } catch (error: any) {
      const appError: AppError = error.appError ?? { message: error.message, type: 'generic' as const };
      set(s => ({
        sessions: {
          ...s.sessions,
          [personaId]: {
            ...getOrInit(s.sessions, personaId),
            isLoading: false,
            error: appError.message,
            errorType: appError.type,
          },
        },
      }));
    }
  },

  sendMessage: async (personaId, content) => {
    const session = getOrInit(get().sessions, personaId);
    if (session.isLoading) return; // block concurrent sends

    const tempId = -(Date.now());
    const tempMsg: PersonaChatMessage = {
      id: tempId,
      role: 'user',
      content,
      tags: [],
      created_at: new Date().toISOString(),
    };

    // Optimistic: add user message immediately
    set(s => ({
      sessions: {
        ...s.sessions,
        [personaId]: {
          ...getOrInit(s.sessions, personaId),
          messages: [...getOrInit(s.sessions, personaId).messages, tempMsg],
          isLoading: true,
          error: null,
          errorType: null,
        },
      },
    }));

    try {
      const result = await personaChatAPI.sendMessage(personaId, content);
      const personaMsg: PersonaChatMessage = {
        id: result.message_id,
        role: 'persona',
        content: result.content,
        mood: result.mood,
        trait: result.trait ?? undefined,
        tags: [],
        created_at: new Date().toISOString(),
      };

      set(s => {
        const cur = getOrInit(s.sessions, personaId);
        return {
          sessions: {
            ...s.sessions,
            [personaId]: {
              ...cur,
              messages: [...cur.messages, personaMsg],
              isLoading: false,
              error: null,
              errorType: null,
            },
          },
        };
      });
    } catch (error: any) {
      const appError: AppError = error.appError ?? { message: error.message, type: 'generic' as const };
      set(s => {
        const cur = getOrInit(s.sessions, personaId);
        return {
          sessions: {
            ...s.sessions,
            [personaId]: {
              ...cur,
              messages: cur.messages.filter(m => m.id !== tempId),
              isLoading: false,
              error: appError.message,
              errorType: appError.type,
            },
          },
        };
      });
    }
  },

  clearSession: async (personaId) => {
    await personaChatAPI.clearSession(personaId);
    set(s => ({
      sessions: {
        ...s.sessions,
        [personaId]: emptySession(personaId),
      },
    }));
  },

  setFeedback: async (personaId, messageId, value) => {
    // Optimistic update
    set(s => {
      const cur = getOrInit(s.sessions, personaId);
      return {
        sessions: {
          ...s.sessions,
          [personaId]: {
            ...cur,
            messages: cur.messages.map(m =>
              m.id === messageId ? { ...m, feedback: value ?? undefined } : m
            ),
          },
        },
      };
    });

    if (value) {
      try {
        await personaChatAPI.sendFeedback(personaId, messageId, value);
      } catch {
        // Rollback on failure
        set(s => {
          const cur = getOrInit(s.sessions, personaId);
          return {
            sessions: {
              ...s.sessions,
              [personaId]: {
                ...cur,
                messages: cur.messages.map(m =>
                  m.id === messageId ? { ...m, feedback: undefined } : m
                ),
              },
            },
          };
        });
      }
    }
  },

  toggleTag: async (personaId, messageId, tag) => {
    const cur = getOrInit(get().sessions, personaId);
    const msg = cur.messages.find(m => m.id === messageId);
    if (!msg) return;

    const prevTags = msg.tags ?? [];
    const newTags = prevTags.includes(tag)
      ? prevTags.filter(t => t !== tag)
      : [...prevTags, tag];

    // Optimistic update
    set(s => {
      const c = getOrInit(s.sessions, personaId);
      return {
        sessions: {
          ...s.sessions,
          [personaId]: {
            ...c,
            messages: c.messages.map(m => m.id === messageId ? { ...m, tags: newTags } : m),
          },
        },
      };
    });

    try {
      await personaChatAPI.setTags(personaId, messageId, newTags);
    } catch {
      // Rollback
      set(s => {
        const c = getOrInit(s.sessions, personaId);
        return {
          sessions: {
            ...s.sessions,
            [personaId]: {
              ...c,
              messages: c.messages.map(m => m.id === messageId ? { ...m, tags: prevTags } : m),
            },
          },
        };
      });
    }
  },
}));
