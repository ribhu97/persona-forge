import { Plus, MessageSquare, PanelLeftClose, Trash2 } from 'lucide-react';
import { PehlooLogo } from '@/components/ui/PehlooLogo';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { usePersonaStore } from '@/stores/personaStore';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
    className?: string;
}

export function Sidebar({ className }: SidebarProps) {
    const {
        conversations,
        currentConversationId,
        fetchConversations,
        selectConversation,
        clearCurrentConversation,
        deleteConversation
    } = useChatStore();

    const { isAuthenticated } = useAuthStore();
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            fetchConversations();
        }
    }, [fetchConversations, isAuthenticated]);

    const { clearAll } = usePersonaStore();

    const handleNewChat = () => {
        clearCurrentConversation();
        clearAll();
    };

    return (
        <div
            className={cn(
                "flex flex-col h-full bg-muted/20 transition-all duration-300 ease-in-out border-r border-border",
                "w-full md:w-auto", // Mobile: full width
                isCollapsed ? "md:w-[60px]" : "md:w-64", // Desktop: collapsible
                className
            )}
        >
            {/* Header / Toggle */}
            <div className={cn("p-4 flex items-center", isCollapsed ? "justify-center" : "justify-between")}>
                <div
                    className="relative cursor-pointer flex items-center gap-2"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    {isCollapsed ? (
                        <div className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors hidden md:flex">
                            <PehlooLogo size={24} />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <PehlooLogo size={24} />
                            <span className="font-display text-lg tracking-tight">PEHLOO</span>
                        </div>
                    )}
                </div>

                {!isCollapsed && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsCollapsed(true)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hidden md:flex"
                    >
                        <PanelLeftClose className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* New Chat Button */}
            {!isCollapsed && (
                <div className="px-4 pb-2">
                    <Button
                        onClick={handleNewChat}
                        className="w-full justify-start gap-2"
                        variant="outline"
                    >
                        <Plus className="w-4 h-4" />
                        New Chat
                    </Button>
                </div>
            )}

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className={cn("space-y-1", isCollapsed ? "px-2" : "px-2")}>
                    {conversations.map((conv) => (
                        <TooltipProvider key={conv.id}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="relative group w-full">
                                        <button
                                            onClick={() => selectConversation(conv.id)}
                                            className={cn(
                                                "flex items-center gap-3 rounded-md transition-colors",
                                                isCollapsed
                                                    ? "w-10 h-10 justify-center mx-auto"
                                                    : "w-full px-3 py-3 text-left",
                                                currentConversationId === conv.id
                                                    ? "bg-accent text-accent-foreground"
                                                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <MessageSquare className="w-4 h-4 shrink-0" />
                                            {!isCollapsed && (
                                                <div className="flex-1 truncate min-w-0 pr-6">
                                                    <span className="font-medium block truncate">
                                                        {conv.title || "New Conversation"}
                                                    </span>
                                                    <span className="text-xs opacity-70 block">
                                                        {new Date(conv.last_message_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            )}
                                        </button>
                                        {!isCollapsed && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 hover:bg-red-50"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm("Are you sure you want to delete this conversation?")) {
                                                        deleteConversation(conv.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </TooltipTrigger>
                                {isCollapsed && (
                                    <TooltipContent side="right">
                                        <p className="font-medium">{conv.title || "New Conversation"}</p>
                                        <p className="text-xs text-muted-foreground">{new Date(conv.last_message_at).toLocaleDateString()}</p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>
                    ))}
                </div>
            </div>

            {/* Footer */}
            {!isCollapsed && (
                <div className="p-4 border-t border-border">
                    {/* Placeholder for user settings */}
                </div>
            )}
        </div>
    );
}