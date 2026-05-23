import axios from 'axios';
import type {
  GeneratePersonasRequest,
  ApiResponse,
  PersonaResponse,
  User,
  LoginResponse,
  SignupResponse,
  ExportStatus,
  ExportFormat,
  BackendPersona,
  Persona,
  UploadResponse,
} from '@/types';

export interface AppError {
  message: string;
  type: 'capacity' | 'limit' | 'auth' | 'generic';
  status?: number;
}

export function normalizeApiError(error: any): AppError {
  const status = error.response?.status;
  const detail: string = error.response?.data?.detail ?? '';

  if (status === 503 || status === 429) {
    return {
      type: 'capacity',
      message: detail.startsWith('AT_CAPACITY:')
        ? detail.replace('AT_CAPACITY:', '').trim()
        : 'Service is currently at capacity. Please try again in a moment.',
      status,
    };
  }
  if (status === 403) {
    return { type: 'limit', message: detail || 'Limit reached.', status };
  }
  if (status === 401) {
    return { type: 'auth', message: 'Session expired. Please log in again.', status };
  }
  if (error.code === 'ECONNABORTED') {
    return { type: 'generic', message: 'Request timeout — the server took too long to respond.' };
  }
  if (!error.response) {
    return { type: 'generic', message: 'Network error — please check your connection.' };
  }
  return {
    type: 'generic',
    message: detail || error.message || 'An unexpected error occurred.',
    status,
  };
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  timeout: 300000, // 5 minutes for long-running generations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for loading states and auth token
apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (import.meta.env.DEV) {
    console.log(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
  }
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);

    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') localStorage.removeItem('token');
    }

    const appError = normalizeApiError(error);
    error.appError = appError;
    // Keep error.message in sync for any catch blocks that read it directly
    error.message = appError.message;

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (data: any): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data);
    return response.data;
  },

  signup: async (data: any): Promise<SignupResponse> => {
    const response = await apiClient.post<SignupResponse>('/auth/signup', data);
    return response.data;
  },

  verifyOtp: async (data: any): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/verify-otp', data);
    return response.data;
  },

  me: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  googleLogin: async (data: { token: string }): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/google', data);
    return response.data;
  }
};

export const personaAPI = {
  generatePersonas: async (data: GeneratePersonasRequest): Promise<PersonaResponse> => {
    const response = await apiClient.post<ApiResponse<PersonaResponse>>(
      '/conversations/generate-personas',
      {
        text: data.text,
        ...(data.fileId ? { file_id: data.fileId } : {}),
      }
    );

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to generate personas');
    }

    return response.data.data;
  },

  healthCheck: async (): Promise<{ status: string; service: string }> => {
    const response = await apiClient.get('/health');
    return response.data;
  },

  uploadFile: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<UploadResponse>('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updatePersona: async (personaId: string | number, updates: Partial<Persona>): Promise<BackendPersona> => {
    const response = await apiClient.put<BackendPersona>(`/personas/${personaId}`, updates);
    return response.data;
  },

  getPersona: async (personaId: number): Promise<BackendPersona> => {
    const response = await apiClient.get<BackendPersona>(`/personas/${personaId}`);
    return response.data;
  },
};

export const chatAPI = {
  getConversations: async (): Promise<any[]> => {
    const response = await apiClient.get('/conversations/');
    return response.data;
  },

  createConversation: async (title?: string): Promise<any> => {
    const response = await apiClient.post('/conversations/', { title });
    return response.data;
  },

  getMessages: async (conversationId: number): Promise<any[]> => {
    const response = await apiClient.get(`/conversations/${conversationId}/messages`);
    return response.data;
  },

  sendMessage: async (conversation_id: number, content: string, fileId?: string): Promise<any> => {
    const response = await apiClient.post(`/conversations/${conversation_id}/messages`, {
      content,
      ...(fileId ? { file_id: fileId } : {}),
    });
    return response.data;
  },

  deleteConversation: async (conversationId: number): Promise<void> => {
    await apiClient.delete(`/conversations/${conversationId}`);
  }
};

export const exportAPI = {
  getStatus: async (): Promise<ExportStatus> => {
    const response = await apiClient.get<ExportStatus>('/export/status');
    return response.data;
  },

  exportPersonas: async (format: ExportFormat, personaIds: number[]): Promise<Blob> => {
    const response = await apiClient.post('/export/personas',
      { format, persona_ids: personaIds },
      { responseType: 'blob' }
    );
    return response.data;
  }
};

export const paymentAPI = {
  createOrder: async (planType: string, amount: number, currency: string): Promise<any> => {
    const response = await apiClient.post('/payments/create-order', {
      amount,
      currency,
      plan_type: planType
    });
    return response.data;
  },

  verifyPayment: async (data: any): Promise<any> => {
    const response = await apiClient.post('/payments/verify-payment', data);
    return response.data;
  }
};

// Blog types matching the backend response
export interface BlogPostSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  author: string;
  read_time: string;
  tags: string[];
  meta_title: string;
  meta_description: string;
  created_at: string;
}

export interface BlogPostFull extends BlogPostSummary {
  content: string;
  updated_at: string;
}

export interface BlogListResponse {
  posts: BlogPostSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const personaChatAPI = {
  sendMessage: async (personaId: number, message: string) => {
    const response = await apiClient.post(`/persona-chat/${personaId}/send`, { message });
    return response.data;
  },

  getMessages: async (personaId: number) => {
    const response = await apiClient.get(`/persona-chat/${personaId}/messages`);
    return response.data;
  },

  sendFeedback: async (personaId: number, messageId: number, rating: 'up' | 'down' | null) => {
    await apiClient.post(`/persona-chat/${personaId}/feedback`, { message_id: messageId, rating });
  },

  setTags: async (personaId: number, messageId: number, tags: string[]) => {
    const response = await apiClient.post(`/persona-chat/${personaId}/message/${messageId}/tags`, { tags });
    return response.data;
  },

  clearSession: async (personaId: number) => {
    await apiClient.delete(`/persona-chat/${personaId}/session`);
  },
};

export const blogAPI = {
  list: async (page = 1, pageSize = 10): Promise<BlogListResponse> => {
    const response = await apiClient.get<BlogListResponse>('/blog/', {
      params: { page, page_size: pageSize },
    });
    return response.data;
  },

  getBySlug: async (slug: string): Promise<BlogPostFull> => {
    const response = await apiClient.get<BlogPostFull>(`/blog/${slug}`);
    return response.data;
  },
};