import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LimitBannerProps {
    message: string;
    onUpgradeClick?: () => void;
    className?: string;
}

export function LimitBanner({ message, onUpgradeClick, className }: LimitBannerProps) {
    return (
        <div className={cn(
            "rounded-lg border-2 border-amber-300 bg-amber-50 p-4 animate-in fade-in slide-in-from-top-2 duration-300",
            className
        )}>
            <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium text-amber-800">
                        {message}
                    </p>
                    {onUpgradeClick && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onUpgradeClick}
                            className="border-amber-400 bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium gap-1"
                        >
                            Upgrade your plan
                            <ArrowRight className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
