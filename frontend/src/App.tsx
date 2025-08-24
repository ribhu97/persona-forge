import { SearchInterface } from '@/components/search/SearchInterface';
import { PersonaPanel } from '@/components/persona/PersonaPanel';
import { ResponsiveLayout } from '@/components/layout/SplitLayout';
import { usePersonaStore } from '@/stores/personaStore';
import { personaAPI } from '@/lib/api';
import type { Persona } from '@/types';

function App() {
  const {
    personas,
    isGenerating,
    error,
    setPersonas,
    setGenerating,
    setError,
    updatePersona,
    deletePersona,
    addPersona,
    clearAll,
  } = usePersonaStore();

  const handleSearch = async (data: { text: string; mode: any; files: any[] }) => {
    setGenerating(true);
    setError(null);

    try {
      const response = await personaAPI.generatePersonas({
        text: data.text,
        mode: data.mode,
        files: data.files,
      });

      // Convert backend personas to frontend format with IDs
      const personasWithIds: Persona[] = response.personas.map((persona, index) => ({
        ...persona,
        id: `persona-${Date.now()}-${index}`,
      }));

      setPersonas(personasWithIds);
    } catch (err) {
      console.error('Failed to generate personas:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate personas');
    } finally {
      setGenerating(false);
    }
  };

  const handleDuplicatePersona = (persona: Persona) => {
    const duplicated: Persona = {
      ...persona,
      id: `persona-${Date.now()}-duplicate`,
      name: `${persona.name} (Copy)`,
    };
    addPersona(duplicated);
  };

  const handleExportAll = () => {
    // TODO: Implement PDF export functionality
    console.log('Export all personas');
  };

  const leftPanel = (
    <div className="h-full overflow-auto bg-background">
      <div className="p-6">
        <SearchInterface 
          onSubmit={handleSearch} 
          isLoading={isGenerating}
        />
        
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );

  const rightPanel = (
    <div className="h-full overflow-auto bg-muted/30">
      <PersonaPanel
        personas={personas}
        onUpdatePersona={updatePersona}
        onDeletePersona={deletePersona}
        onDuplicatePersona={handleDuplicatePersona}
        onExportAll={handleExportAll}
        onClearAll={clearAll}
        isLoading={isGenerating}
      />
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden">
      <ResponsiveLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        rightPanelLabel="Personas"
        rightPanelBadge={personas.length}
      />
    </div>
  );
}

export default App;
