import { Clock, RotateCcw } from 'lucide-react';

interface CapacityBannerProps {
    message: string;
    onRetry: () => void;
    isRetrying: boolean;
}

export function CapacityBanner({ message, onRetry, isRetrying }: CapacityBannerProps) {
    return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">We're at capacity right now</p>
                <p className="text-sm text-amber-700 mt-0.5">{message}</p>
            </div>
            <button
                onClick={onRetry}
                disabled={isRetrying}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                <RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying…' : 'Retry'}
            </button>
        </div>
    );
}
