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

// --- Persona Chat types ---

export type PersonaChatMood =
  | 'deadpan' | 'thoughtful' | 'neutral' | 'matter-of-fact'
  | 'frustrated' | 'skeptical' | 'blunt' | 'dry'
  | 'curious' | 'driven' | 'enthused' | 'thinking'; // 'thinking' is UI-only

export interface TraitAttribution {
  source_type: string;
  text: string;
  source_index: number;
}

export interface PersonaChatMessage {
  id: number;
  role: 'user' | 'persona';
  content: string;
  mood?: PersonaChatMood;
  trait?: TraitAttribution;
  feedback?: 'up' | 'down' | null;
  tags: string[];
  created_at: string;
}

export interface PersonaChatSessionState {
  personaId: number;
  messages: PersonaChatMessage[];
  isLoading: boolean;
  error: string | null;
  errorType: 'capacity' | 'limit' | 'auth' | 'generic' | null;
}

export type TagType = 'insight' | 'friction' | 'quote';
export type ProfileDensity = 'rail' | 'collapsed';
