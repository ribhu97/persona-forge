import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  Persona, 
  GenerationMode, 
  ProcessedFile, 
  ConversationEntry 
} from '@/types';

interface PersonaStore {
  // State
  personas: Persona[];
  currentMode: GenerationMode;
  isGenerating: boolean;
  error: string | null;
  uploadedFiles: ProcessedFile[];
  conversationHistory: ConversationEntry[];
  
  // Actions
  addPersona: (persona: Persona) => void;
  updatePersona: (id: string, updates: Partial<Persona>) => void;
  deletePersona: (id: string) => void;
  setPersonas: (personas: Persona[]) => void;
  setMode: (mode: GenerationMode) => void;
  addFile: (file: ProcessedFile) => void;
  removeFile: (fileId: string) => void;
  setGenerating: (isGenerating: boolean) => void;
  setError: (error: string | null) => void;
  addConversationEntry: (entry: ConversationEntry) => void;
  clearAll: () => void;
}

export const usePersonaStore = create<PersonaStore>()(
  persist(
    (set) => ({
      // Initial state
      personas: [],
      currentMode: 'quick',
      isGenerating: false,
      error: null,
      uploadedFiles: [],
      conversationHistory: [],
      
      // Actions
      addPersona: (persona) => 
        set((state) => ({ 
          personas: [...state.personas, persona] 
        })),
        
      updatePersona: (id, updates) =>
        set((state) => ({
          personas: state.personas.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
        
      deletePersona: (id) =>
        set((state) => ({
          personas: state.personas.filter((p) => p.id !== id),
        })),
        
      setPersonas: (personas) => set({ personas }),
      
      setMode: (mode) => set({ currentMode: mode }),
      
      addFile: (file) =>
        set((state) => ({
          uploadedFiles: [...state.uploadedFiles, file],
        })),
        
      removeFile: (fileId) =>
        set((state) => ({
          uploadedFiles: state.uploadedFiles.filter((f) => f.id !== fileId),
        })),
        
      setGenerating: (isGenerating) => set({ isGenerating }),
      
      setError: (error) => set({ error }),
      
      addConversationEntry: (entry) =>
        set((state) => ({
          conversationHistory: [...state.conversationHistory, entry],
        })),
        
      clearAll: () =>
        set({
          personas: [],
          uploadedFiles: [],
          conversationHistory: [],
          error: null,
        }),
    }),
    {
      name: 'persona-storage',
      partialize: (state) => ({
        personas: state.personas,
        currentMode: state.currentMode,
        conversationHistory: state.conversationHistory,
      }),
    }
  )
);