import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, FileJson, FileText, AlertTriangle, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportAPI } from '@/lib/api';
import type { ExportStatus, ExportFormat, Persona } from '@/types';
import { AccountType } from '@/types';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    personas: Persona[];
}

export function ExportDialog({ open, onOpenChange, personas }: ExportDialogProps) {
    const navigate = useNavigate();
    const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Fetch export status when dialog opens
    useEffect(() => {
        if (open) {
            fetchExportStatus();
            setSuccess(false);
            setError(null);
        }
    }, [open]);

    const fetchExportStatus = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const status = await exportAPI.getStatus();
            setExportStatus(status);
        } catch (err: any) {
            setError('Failed to check export status');
            console.error('Export status error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = async () => {
        if (!canExport || personas.length === 0) return;

        setIsExporting(true);
        setError(null);

        try {
            // Get persona IDs (filter for numeric IDs from backend)
            const personaIds = personas
                .map(p => typeof p.id === 'number' ? p.id : parseInt(String(p.id)))
                .filter(id => !isNaN(id));

            if (personaIds.length === 0) {
                throw new Error('No valid persona IDs to export');
            }

            const blob = await exportAPI.exportPersonas(selectedFormat, personaIds);

            // Create download link
            const url = window.URL.createObjectURL(blob);
            try {
                const a = document.createElement('a');
                a.href = url;
                a.download = `personas_${new Date().toISOString().slice(0, 10)}.${selectedFormat}`;
                document.body.appendChild(a);
                a.click();

                // Small delay to ensure browser triggers download before cleanup
                setTimeout(() => {
                    document.body.removeChild(a);
                }, 100);
            } finally {
                window.URL.revokeObjectURL(url);
            }

            setSuccess(true);

            // Refresh status after export
            await fetchExportStatus();

            // Close dialog after short delay
            setTimeout(() => {
                onOpenChange(false);
            }, 1500);

        } catch (err: any) {
            const errorMessage = err.response?.data?.detail?.message || err.message || 'Export failed';
            setError(errorMessage);
        } finally {
            setIsExporting(false);
        }
    };

    const formatNextAvailableDate = (dateStr: string | null) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const isAdmin = exportStatus?.account_type === AccountType.ADMIN;
    const canExport = (exportStatus?.can_export ?? false) || isAdmin;

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-[80]" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-[81] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border-2 border-border bg-card p-6 text-foreground shadow-[8px_8px_0_hsl(var(--foreground)/0.8)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-none">
                    <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                        <Dialog.Title className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
                            <Download className="h-5 w-5" />
                            Export Personas
                        </Dialog.Title>
                        <Dialog.Description className="text-sm text-muted-foreground">
                            Download your {personas.length} persona{personas.length === 1 ? '' : 's'} as PDF or JSON
                        </Dialog.Description>
                    </div>

                    {isLoading || (!exportStatus && !error) ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Rate Limit Banner - Prominent for free users who can't export */}
                            {!canExport && !isAdmin && (
                                <div className="rounded-none border-2 border-signal-mood/50 bg-signal-mood/10 p-4">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="h-6 w-6 text-signal-mood flex-shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <h4 className="font-semibold text-signal-mood">
                                                FREE ACCOUNT LIMIT REACHED
                                            </h4>
                                            <p className="text-sm text-amber-300">
                                                You have <span className="font-bold">0 exports</span> remaining this month.
                                            </p>
                                            {exportStatus?.next_export_available && (
                                                <p className="text-sm text-amber-300">
                                                    Next export available: <span className="font-semibold">
                                                        {formatNextAvailableDate(exportStatus.next_export_available)}
                                                    </span>
                                                </p>
                                            )}
                                            <div className="pt-2">
                                                <button
                                                    onClick={() => navigate('/pricing')}
                                                    className="text-sm font-medium text-signal-mood underline underline-offset-2 hover:opacity-80"
                                                >
                                                    Upgrade to unlock unlimited exports →
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Status badge for users who can export */}
                            {canExport && (
                                <div className={cn(
                                    "rounded-none p-3 text-sm",
                                    isAdmin
                                        ? "border-2 border-status-secondary/50 bg-status-secondary/10 text-status-secondary"
                                        : "border-2 border-signal-goal/50 bg-signal-goal/10 text-signal-goal"
                                )}>
                                    {isAdmin ? (
                                        <span className="flex items-center gap-2">
                                            <Check className="h-4 w-4" />
                                            <span><strong>Admin Account</strong> – Unlimited exports</span>
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <Check className="h-4 w-4" />
                                            <span>You have <strong>{exportStatus?.exports_remaining} export</strong> remaining this month</span>
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Format Selection */}
                            <div className="space-y-3">
                                <label className="text-sm font-mono tracking-widest uppercase">Select Format</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFormat('pdf')}
                                        disabled={!canExport}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-4 rounded-none border-2 transition-all duration-150",
                                            selectedFormat === 'pdf'
                                                ? "border-foreground bg-muted shadow-[3px_3px_0_hsl(var(--foreground)/0.6)]"
                                                : "border-border hover:border-foreground hover:bg-muted",
                                            !canExport && "opacity-50 cursor-not-allowed hover:border-border hover:bg-card"
                                        )}
                                    >
                                        <FileText className={cn(
                                            "h-8 w-8 transition-colors",
                                            selectedFormat === 'pdf' ? "text-foreground" : "text-muted-foreground"
                                        )} />
                                        <span className={cn(
                                            "font-semibold transition-colors",
                                            selectedFormat === 'pdf' ? "text-foreground" : "text-muted-foreground"
                                        )}>PDF</span>
                                        <span className="text-xs text-muted-foreground">Formatted document</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedFormat('json')}
                                        disabled={!canExport}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-4 rounded-none border-2 transition-all duration-150",
                                            selectedFormat === 'json'
                                                ? "border-foreground bg-muted shadow-[3px_3px_0_hsl(var(--foreground)/0.6)]"
                                                : "border-border hover:border-foreground hover:bg-muted",
                                            !canExport && "opacity-50 cursor-not-allowed hover:border-border hover:bg-card"
                                        )}
                                    >
                                        <FileJson className={cn(
                                            "h-8 w-8 transition-colors",
                                            selectedFormat === 'json' ? "text-foreground" : "text-muted-foreground"
                                        )} />
                                        <span className={cn(
                                            "font-semibold transition-colors",
                                            selectedFormat === 'json' ? "text-foreground" : "text-muted-foreground"
                                        )}>JSON</span>
                                        <span className="text-xs text-muted-foreground">Raw data</span>
                                    </button>
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="border-2 border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                                    {error}
                                </div>
                            )}

                            {/* Success Message */}
                            {success && (
                                <div className="flex items-center gap-2 border-2 border-signal-goal/50 bg-signal-goal/10 p-3 text-sm text-signal-goal">
                                    <Check className="h-4 w-4" />
                                    Export successful! Your download should start automatically.
                                </div>
                            )}

                            {/* Export Button */}
                            <Button
                                onClick={handleExport}
                                disabled={!canExport || isExporting || personas.length === 0}
                                className="w-full"
                            >
                                {isExporting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Exporting...
                                    </>
                                ) : (
                                    <>
                                        <Download className="mr-2 h-4 w-4" />
                                        Export as {selectedFormat.toUpperCase()}
                                    </>
                                )}
                            </Button>
                        </div>
                    )}

                    <Dialog.Close className="absolute right-4 top-4 rounded-none opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
