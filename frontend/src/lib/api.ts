import axios from 'axios';
import type { 
  GeneratePersonasRequest, 
  ApiResponse, 
  PersonaResponse 
} from '@/types';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 300000, // 5 minutes for long-running generations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for loading states
apiClient.interceptors.request.use((config) => {
  console.log(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    
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

export const personaAPI = {
  generatePersonas: async (data: GeneratePersonasRequest): Promise<PersonaResponse> => {
    const response = await apiClient.post<ApiResponse<PersonaResponse>>(
      '/generate-personas', 
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