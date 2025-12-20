import { create } from 'zustand';
import { chatAPI } from '@/lib/api';
import type { Conversation, Message } from '@/types';

interface ChatStore {
    conversations: Conversation[];
    currentConversationId: number | null;
    messages: Message[];
    isLoading: boolean;
    error: string | null;

    // Actions
    fetchConversations: () => Promise<void>;
    createConversation: (title?: string) => Promise<Conversation>;
    selectConversation: (id: number) => Promise<void>;
    sendMessage: (content: string) => Promise<void>;
    clearCurrentConversation: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
    conversations: [],
    currentConversationId: null,
    messages: [],
    isLoading: false,
    error: null,

    fetchConversations: async () => {
        set({ isLoading: true, error: null });
        try {
            const conversations = await chatAPI.getConversations();
            set({ conversations });
        } catch (error: any) {
            set({ error: error.message });
        } finally {
            set({ isLoading: false });
        }
    },

    createConversation: async (title?: string) => {
        set({ isLoading: true, error: null });
        try {
            const conversation = await chatAPI.createConversation(title);
            set(state => ({
                conversations: [conversation, ...state.conversations],
                currentConversationId: conversation.id,
                messages: []
            }));
            return conversation;
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    selectConversation: async (id: number) => {
        set({ currentConversationId: id, isLoading: true, error: null });
        try {
            const messages = await chatAPI.getMessages(id);
            set({ messages });
        } catch (error: any) {
            set({ error: error.message });
        } finally {
            set({ isLoading: false });
        }
    },

    sendMessage: async (content: string) => {
        const { currentConversationId } = get();
        if (!currentConversationId) return;

        set({ isLoading: true, error: null });

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
            const response = await chatAPI.sendMessage(currentConversationId, content);

            // Replace temp message with real one and add assistant response
            // Note: The backend returns the assistant message. We need to fetch updated messages or handle this carefully.
            // For now, let's just append the assistant message returned by the API.
            // Ideally we should replace the temp message with the real user message too if the API returned it, 
            // but our API currently returns the Assistant message.

            set(state => ({
                messages: [...state.messages, response] // Response is the assistant message
            }));

            // Also update the conversation list to show new timestamp/preview if we had that info
            // For now just re-fetch conversations to update order
            get().fetchConversations();

        } catch (error: any) {
            set(state => ({
                error: error.message,
                messages: state.messages.filter(m => m.id !== tempMessage.id) // Rollback
            }));
        } finally {
            set({ isLoading: false });
        }
    },

    clearCurrentConversation: () => {
        set({ currentConversationId: null, messages: [] });
    }
}));
