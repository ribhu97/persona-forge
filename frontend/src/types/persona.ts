export interface Demographics {
  age: string;
  location: string;
  education: string;
  industry: string;
}

export interface BackendGoal {
  goal_text: string;
  order_index: number;
}

export interface BackendFrustration {
  frustration_text: string;
  order_index: number;
}

export interface BackendBehavioralPattern {
  pattern_text: string;
  order_index: number;
}

export interface BackendInfluenceNetwork {
  network_text: string;
  order_index: number;
}

export interface BackendRecruitmentCriteria {
  criteria_text: string;
  order_index: number;
}

export interface BackendResearchAssumption {
  assumption_text: string;
  order_index: number;
}

export interface BackendPersona {
  id: number;
  name: string;
  status: 'primary' | 'secondary';
  role: string;
  tech_comfort: 'low' | 'medium' | 'high';
  scenario_context: string;
  demographics: {
    age: string;
    location: string;
    education: string;
    industry: string;
  };
  goals: BackendGoal[];
  frustrations: BackendFrustration[];
  behavioral_patterns: BackendBehavioralPattern[];
  influence_networks: BackendInfluenceNetwork[];
  recruitment_criteria: BackendRecruitmentCriteria[];
  research_assumptions: BackendResearchAssumption[];
}

export interface Persona {
  id: string | number;
  name: string;
  status: 'primary' | 'secondary';
  role: string;
  demographics: Demographics;
  goals: string[];
  frustrations: string[];
  behavioral_patterns: string[];
  tech_comfort: 'low' | 'medium' | 'high';
  scenario_context: string;
  influence_networks: string[];
  recruitment_criteria: string[];
  research_assumptions: string[];
}

export interface PersonaVersion {
  id: string; // usually message_id
  timestamp: Date;
  personas: Persona[];
}

export interface PersonaResponse {
  personas: BackendPersona[];
}

export type GenerationMode = 'quick' | 'think_hard' | 'homework';

export interface GeneratePersonasRequest {
  text: string;
  mode?: GenerationMode;
  files?: ProcessedFile[];
  fileId?: string;
}

export interface ProcessedFile {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'markdown' | 'docx' | 'txt';
  size: number;
  content?: string;
  base64?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
}

export interface UploadResponse {
  file_id: string;
  filename: string;
  file_type: string;
  size: number;
  status: string;
  truncated: boolean;
  char_count?: number;
  warnings: string[];
}

export interface AttachmentInfo {
  filename: string;
  file_type: string;
  degraded_mode: boolean;
  truncated: boolean;
  char_count?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface ConversationEntry {
  id: string;
  timestamp: Date;
  input: string;
  output: PersonaResponse | null;
  mode: GenerationMode;
  files: ProcessedFile[];
}

// Export types
export interface ExportStatus {
  can_export: boolean;
  account_type: number;
  exports_remaining: number;
  last_export_at: string | null;
  next_export_available: string | null;
}

export type ExportFormat = 'pdf' | 'json';

// ── Job / Think Hard types ────────────────────────────────────────────────────

export interface JobResponse {
  id: string;
  state: 'queued' | 'running' | 'persisting' | 'succeeded' | 'failed' | 'timed_out';
  mode: 'quick' | 'think_hard';
  error_code: string | null;
  error_detail: string | null;
  assistant_message_id: number | null;
  created_at: string;
  expires_at: string;
}

export interface JobCreateRequest {
  text: string;
  mode: 'quick' | 'think_hard';
  file_id?: string;
  idempotency_key?: string;
}

export interface JobEvent {
  id: number | null;
  event: string | null;
  data: string;
}

export type ThinkHardStage =
  | 'queued' | 'running' | 'draft' | 'judge'
  | 'critique' | 'revise' | 'persisting'
  | 'succeeded' | 'failed' | 'timed_out';

export interface ThinkHardProgress {
  stage: ThinkHardStage;
  message: string;
  isTerminal: boolean;
  error?: string | null;
}