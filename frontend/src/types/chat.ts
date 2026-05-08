import type { BackendPersona, AttachmentInfo } from './persona';

export interface Message {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
    personas?: BackendPersona[];
    attachment?: AttachmentInfo;
    degraded_mode?: boolean;
    warnings?: string[];
}

export interface Conversation {
    id: number;
    title: string;
    last_message_at: string;
    created_at: string;
}

export interface ChatState {
    conversations: Conversation[];
    currentConversationId: number | null;
    messages: Message[];
    isLoading: boolean;
    error: string | null;
}
