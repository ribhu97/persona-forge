export interface Message {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
    personas?: any[]; // Using any[] for now to avoid circular dependency, or import Persona type
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
