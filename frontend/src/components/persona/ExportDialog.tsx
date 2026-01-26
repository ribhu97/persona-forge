import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, FileJson, FileText, AlertTriangle, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportAPI } from '@/lib/api';
import type { ExportStatus, ExportFormat, Persona } from '@/types';
import { AccountType } from '@/types';
import { cn } from '@/lib/utils';

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    personas: Persona[];
}

export function ExportDialog({ open, onOpenChange, personas }: ExportDialogProps) {
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
        if (!exportStatus?.can_export || personas.length === 0) return;

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
    const canExport = exportStatus?.can_export ?? false;

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
                    <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                        <Dialog.Title className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
                            <Download className="h-5 w-5" />
                            Export Personas
                        </Dialog.Title>
                        <Dialog.Description className="text-sm text-muted-foreground">
                            Download your {personas.length} persona{personas.length === 1 ? '' : 's'} as PDF or JSON
                        </Dialog.Description>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Rate Limit Banner - Prominent for free users who can't export */}
                            {!canExport && !isAdmin && (
                                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <h4 className="font-semibold text-amber-800">
                                                FREE ACCOUNT LIMIT REACHED
                                            </h4>
                                            <p className="text-sm text-amber-700">
                                                You have <span className="font-bold">0 exports</span> remaining this month.
                                            </p>
                                            {exportStatus?.next_export_available && (
                                                <p className="text-sm text-amber-700">
                                                    Next export available: <span className="font-semibold">
                                                        {formatNextAvailableDate(exportStatus.next_export_available)}
                                                    </span>
                                                </p>
                                            )}
                                            <div className="pt-2">
                                                <button
                                                    onClick={() => window.location.href = '/?pricing=true'}
                                                    className="text-sm font-medium text-amber-800 hover:text-amber-900 underline underline-offset-2"
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
                                    "rounded-lg p-3 text-sm",
                                    isAdmin
                                        ? "bg-purple-50 border border-purple-200 text-purple-700"
                                        : "bg-green-50 border border-green-200 text-green-700"
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
                                <label className="text-sm font-medium">Select Format</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFormat('pdf')}
                                        disabled={!canExport}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-150",
                                            selectedFormat === 'pdf'
                                                ? "border-gray-900 bg-gray-50 shadow-sm"
                                                : "border-gray-200 hover:border-gray-400 hover:bg-gray-50",
                                            !canExport && "opacity-50 cursor-not-allowed hover:border-gray-200 hover:bg-white"
                                        )}
                                    >
                                        <FileText className={cn(
                                            "h-8 w-8 transition-colors",
                                            selectedFormat === 'pdf' ? "text-gray-900" : "text-gray-400"
                                        )} />
                                        <span className={cn(
                                            "font-semibold transition-colors",
                                            selectedFormat === 'pdf' ? "text-gray-900" : "text-gray-500"
                                        )}>PDF</span>
                                        <span className="text-xs text-gray-400">Formatted document</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedFormat('json')}
                                        disabled={!canExport}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-150",
                                            selectedFormat === 'json'
                                                ? "border-gray-900 bg-gray-50 shadow-sm"
                                                : "border-gray-200 hover:border-gray-400 hover:bg-gray-50",
                                            !canExport && "opacity-50 cursor-not-allowed hover:border-gray-200 hover:bg-white"
                                        )}
                                    >
                                        <FileJson className={cn(
                                            "h-8 w-8 transition-colors",
                                            selectedFormat === 'json' ? "text-gray-900" : "text-gray-400"
                                        )} />
                                        <span className={cn(
                                            "font-semibold transition-colors",
                                            selectedFormat === 'json' ? "text-gray-900" : "text-gray-500"
                                        )}>JSON</span>
                                        <span className="text-xs text-gray-400">Raw data</span>
                                    </button>
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                                    {error}
                                </div>
                            )}

                            {/* Success Message */}
                            {success && (
                                <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
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

                    <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
