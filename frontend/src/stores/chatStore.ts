import { create } from 'zustand';
import { chatAPI } from '@/lib/api';
import type { AppError } from '@/lib/api';
import type { Conversation, Message } from '@/types';

interface ChatStore {
    conversations: Conversation[];
    currentConversationId: number | null;
    messages: Message[];
    isLoading: boolean;
    error: string | null;
    errorType: AppError['type'] | null;
    lastFailedContent: string | null;
    lastFailedConversationId: number | null;

    // Actions
    fetchConversations: () => Promise<void>;
    createConversation: (title?: string) => Promise<Conversation>;
    selectConversation: (id: number) => Promise<void>;
    sendMessage: (content: string, fileId?: string) => Promise<void>;
    retryMessage: () => Promise<void>;
    clearCurrentConversation: () => void;
    deleteConversation: (id: number) => Promise<void>;
    reset: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
    conversations: [],
    currentConversationId: null,
    messages: [],
    isLoading: false,
    error: null,
    errorType: null,
    lastFailedContent: null,
    lastFailedConversationId: null,

    fetchConversations: async () => {
        set({ isLoading: true, error: null, errorType: null });
        try {
            const conversations = await chatAPI.getConversations();
            set({ conversations });
        } catch (error: any) {
            const appError = error.appError ?? { message: error.message, type: 'generic' as const };
            set({ error: appError.message, errorType: 'generic' });
        } finally {
            set({ isLoading: false });
        }
    },

    createConversation: async (title?: string) => {
        set({ isLoading: true, error: null, errorType: null });
        try {
            const conversation = await chatAPI.createConversation(title);
            set(state => ({
                conversations: [conversation, ...state.conversations],
                currentConversationId: conversation.id,
                messages: []
            }));
            return conversation;
        } catch (error: any) {
            const appError = error.appError ?? { message: error.message, type: 'generic' as const };
            set({ error: appError.message, errorType: 'generic' });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    selectConversation: async (id: number) => {
        set({
            currentConversationId: id,
            isLoading: true,
            error: null,
            errorType: null,
            // Clear capacity state so the banner and retry button don't bleed
            // across conversations — retry would silently no-op on the wrong thread.
            lastFailedContent: null,
            lastFailedConversationId: null,
        });
        try {
            const messages = await chatAPI.getMessages(id);
            set({ messages });
        } catch (error: any) {
            const appError = error.appError ?? { message: error.message, type: 'generic' as const };
            set({ error: appError.message, errorType: 'generic' });
        } finally {
            set({ isLoading: false });
        }
    },

    sendMessage: async (content: string, fileId?: string) => {
        const { currentConversationId } = get();
        if (!currentConversationId) return;

        // Capture before async work so retry/rollback use the right values.
        const capturedConvId = currentConversationId;

        set({ isLoading: true, error: null, errorType: null });

        // Optimistic update
        const tempMessage: Message = {
            id: Date.now(),
            role: 'user',
            content,
            created_at: new Date().toISOString()
        };

        set(state => ({
            messages: [...state.messages, tempMessage]
        }));

        try {
            const response = await chatAPI.sendMessage(capturedConvId, content, fileId);

            set(state => ({
                messages: [...state.messages, response],
                error: null,
                errorType: null,
                lastFailedContent: null,
                lastFailedConversationId: null,
            }));

            get().fetchConversations();

        } catch (error: any) {
            const appError: AppError = error.appError ?? { message: error.message, type: 'generic' as const };

            set(state => ({
                error: appError.message,
                errorType: appError.type,
                // Only preserve retry context for capacity errors — other error types
                // (limit, auth, generic) don't benefit from a blind retry.
                lastFailedContent: appError.type === 'capacity' ? content : null,
                lastFailedConversationId: appError.type === 'capacity' ? capturedConvId : null,
                messages: state.messages.filter(m => m.id !== tempMessage.id),
            }));
        } finally {
            set({ isLoading: false });
        }
    },

    retryMessage: async () => {
        const { lastFailedContent, lastFailedConversationId, currentConversationId, isLoading } = get();
        // Guard against: no pending retry, already loading, or user switched conversations.
        if (isLoading || !lastFailedContent || lastFailedConversationId !== currentConversationId) return;
        await get().sendMessage(lastFailedContent);
    },

    clearCurrentConversation: () => {
        set({ currentConversationId: null, messages: [] });
    },

    deleteConversation: async (id: number) => {
        try {
            await chatAPI.deleteConversation(id);
            set(state => ({
                conversations: state.conversations.filter(c => c.id !== id),
                currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
                messages: state.currentConversationId === id ? [] : state.messages
            }));
        } catch (error: any) {
            const appError = error.appError ?? { message: error.message, type: 'generic' as const };
            set({ error: appError.message, errorType: 'generic' });
            throw error;
        }
    },

    reset: () => {
        set({
            conversations: [],
            currentConversationId: null,
            messages: [],
            error: null,
            errorType: null,
            isLoading: false,
            lastFailedContent: null,
            lastFailedConversationId: null,
        });
    }
}));
