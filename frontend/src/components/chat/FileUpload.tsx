import { useDropzone } from 'react-dropzone';
import { X, FileText, Image, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACCEPTED_TYPES, useFileUpload } from '@/hooks/useFileUpload';
import type { UploadState } from '@/hooks/useFileUpload';

interface FileUploadProps {
  onFileReady: (fileId: string, filename: string) => void;
  onFileRemoved: () => void;
  disabled?: boolean;
  className?: string;
  /** When provided, the component uses this state instead of managing its own.
   *  Use this when a parent (e.g. SearchInterface) owns the dropzone for a larger area. */
  externalState?: UploadState;
  externalHandleRemove?: () => void;
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

export function FileUpload({
  onFileReady,
  onFileRemoved,
  disabled,
  className,
  externalState,
  externalHandleRemove,
}: FileUploadProps) {
  const internal = useFileUpload({ onFileReady, onFileRemoved });
  const state = externalState ?? internal.state;
  const handleRemove = externalHandleRemove ?? internal.handleRemove;

  // Click-to-browse only; drag is handled by the parent when externalState is used.
  const { getInputProps, open } = useDropzone({
    onDrop: internal.handleFiles,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    disabled: disabled || state.status === 'uploading',
    noClick: true,
    noKeyboard: true,
    noDrag: !!externalState, // disable drag on this zone when parent owns it
  });

  if (state.status === 'idle') {
    return (
      <div className={cn(className)}>
        <input {...getInputProps()} />
        <button
          type="button"
          onClick={open}
          disabled={disabled}
          className={cn(
            'flex items-center justify-center h-9 w-9 rounded-lg cursor-pointer',
            'hover:bg-muted/60 transition-colors duration-200',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          title="Attach a file (PDF, image, DOCX, TXT, MD)"
        >
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
        </button>
      </div>
    );
  }

  if (state.status === 'uploading') {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5 bg-muted/40 rounded-lg text-sm', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-xs">Uploading…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5 bg-destructive/10 rounded-lg text-sm max-w-xs', className)}>
        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        <span className="text-destructive text-xs truncate">{state.message}</span>
        <button
          type="button"
          onClick={handleRemove}
          className="ml-auto text-destructive hover:text-destructive/70 transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Ready — file chip
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
          type="button"
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
