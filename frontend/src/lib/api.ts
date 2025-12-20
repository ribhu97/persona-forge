import axios from 'axios';
import type {
  GeneratePersonasRequest,
  ApiResponse,
  PersonaResponse,
  User,
  LoginResponse,
  SignupResponse
} from '@/types';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 300000, // 5 minutes for long-running generations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for loading states and auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);

    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Optionally redirect to login or clear auth state via store (handled in store)
    }

    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timeout - the server took too long to respond';
    } else if (error.response?.status === 500) {
      error.message = 'Server error - please try again later';
    } else if (error.response?.status === 400) {
      error.message = error.response.data?.detail || 'Invalid request';
    } else if (!error.response) {
      error.message = 'Network error - please check your connection';
    }

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

  googleLogin: async (token: string): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/google', { token });
    return response.data;
  }
};

export const personaAPI = {
  generatePersonas: async (data: GeneratePersonasRequest): Promise<PersonaResponse> => {
    const response = await apiClient.post<ApiResponse<PersonaResponse>>(
      '/conversations/generate-personas',
      { text: data.text }
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

  // Future endpoint for file uploads
  uploadFiles: async (files: File[]): Promise<any> => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const response = await apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
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

  sendMessage: async (conversationId: number, content: string): Promise<any> => {
    const response = await apiClient.post(`/conversations/${conversationId}/messages`, { content });
    return response.data;
  }
};