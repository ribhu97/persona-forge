import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, FileText, Image, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { personaAPI } from '@/lib/api';
import type { UploadResponse } from '@/types';

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
};

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'ready'; response: UploadResponse }
  | { status: 'error'; message: string };

interface FileUploadProps {
  onFileReady: (fileId: string, filename: string) => void;
  onFileRemoved: () => void;
  disabled?: boolean;
  className?: string;
}

function fileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return <Image className="h-4 w-4 shrink-0" />;
  }
  return <FileText className="h-4 w-4 shrink-0" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({ onFileReady, onFileRemoved, disabled, className }: FileUploadProps) {
  const [state, setState] = useState<UploadState>({ status: 'idle' });

  const handleDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
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

  const handleRemove = () => {
    setState({ status: 'idle' });
    onFileRemoved();
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    disabled: disabled || state.status === 'uploading',
    noClick: state.status !== 'idle',
    noKeyboard: state.status !== 'idle',
  });

  // Idle — show clickable dropzone trigger
  if (state.status === 'idle') {
    return (
      <div
        {...getRootProps()}
        className={cn(
          'flex items-center justify-center h-9 w-9 rounded-lg cursor-pointer',
          'hover:bg-muted/60 transition-colors duration-200',
          isDragActive && 'bg-primary/10 ring-2 ring-primary',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
        title="Attach a file (PDF, image, DOCX, TXT, MD)"
      >
        <input {...getInputProps()} />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
    );
  }

  // Uploading
  if (state.status === 'uploading') {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5 bg-muted/40 rounded-lg text-sm', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-xs">Uploading…</span>
      </div>
    );
  }

  // Error
  if (state.status === 'error') {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5 bg-destructive/10 rounded-lg text-sm max-w-xs', className)}>
        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        <span className="text-destructive text-xs truncate">{state.message}</span>
        <button
          onClick={handleRemove}
          className="ml-auto text-destructive hover:text-destructive/70 transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Ready — show file chip
  const { response } = state;
  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 bg-muted/60 rounded-lg text-sm max-w-xs', className)}>
      {fileIcon(response.filename)}
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium truncate">{response.filename}</span>
        <span className="text-xs text-muted-foreground">{formatBytes(response.size)}</span>
      </div>
      {response.truncated && (
        <span
          className="text-xs text-amber-600 shrink-0"
          title={response.warnings.join('\n')}
        >
          Truncated
        </span>
      )}
      {!disabled && (
        <button
          onClick={handleRemove}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Remove file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
