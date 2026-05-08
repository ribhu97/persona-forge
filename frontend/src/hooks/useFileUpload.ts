import { useCallback, useState } from 'react';
import { personaAPI } from '@/lib/api';
import type { UploadResponse } from '@/types';

export const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
};

export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'ready'; response: UploadResponse }
  | { status: 'error'; message: string };

interface UseFileUploadOptions {
  onFileReady: (fileId: string, filename: string) => void;
  onFileRemoved: () => void;
}

export function useFileUpload({ onFileReady, onFileRemoved }: UseFileUploadOptions) {
  const [state, setState] = useState<UploadState>({ status: 'idle' });

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      setState({ status: 'uploading' });
      try {
        const response = await personaAPI.uploadFile(file);
        setState({ status: 'ready', response });
        onFileReady(response.file_id, response.filename);
      } catch (err: any) {
        const detail =
          err.response?.data?.detail ||
          err.appError?.message ||
          err.message ||
          'Upload failed. Please try again.';
        setState({ status: 'error', message: detail });
      }
    },
    [onFileReady],
  );

  const handleRemove = useCallback(() => {
    setState({ status: 'idle' });
    onFileRemoved();
  }, [onFileRemoved]);

  const isIdle = state.status === 'idle';
  const isUploading = state.status === 'uploading';

  return { state, handleFiles, handleRemove, isIdle, isUploading };
}
