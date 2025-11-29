import { Plus, MessageSquare, PanelLeftClose, PanelLeftOpen, Box } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
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
        clearCurrentConversation
    } = useChatStore();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isHoveringLogo, setIsHoveringLogo] = useState(false);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    const handleNewChat = () => {
        clearCurrentConversation();
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
                    onMouseEnter={() => setIsHoveringLogo(true)}
                    onMouseLeave={() => setIsHoveringLogo(false)}
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    {isCollapsed ? (
                        <div className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors hidden md:flex">
                            {isHoveringLogo ? (
                                <PanelLeftOpen className="w-5 h-5 text-muted-foreground" />
                            ) : (
                                <Box className="w-6 h-6 text-primary" />
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Box className="w-6 h-6 text-primary" />
                            <span className="font-bold text-lg">Pehloo</span>
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
            <div className={cn("px-4 pb-4", isCollapsed && "px-2")}>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={handleNewChat}
                                className={cn(
                                    "flex items-center gap-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors",
                                    isCollapsed ? "w-10 h-10 justify-center p-0 mx-auto" : "w-full px-4 py-2"
                                )}
                            >
                                <Plus className={cn("w-4 h-4", !isCollapsed && "mr-1")} />
                                {!isCollapsed && <span>New Chat</span>}
                            </button>
                        </TooltipTrigger>
                        {isCollapsed && <TooltipContent side="right">New Chat</TooltipContent>}
                    </Tooltip>
                </TooltipProvider>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className={cn("space-y-1", isCollapsed ? "px-2" : "px-2")}>
                    {conversations.map((conv) => (
                        <TooltipProvider key={conv.id}>
                            <Tooltip>
                                <TooltipTrigger asChild>
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
                                            <div className="flex-1 truncate min-w-0">
                                                <span className="font-medium block truncate">
                                                    {conv.title || "New Conversation"}
                                                </span>
                                                <span className="text-xs opacity-70 block">
                                                    {new Date(conv.last_message_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                    </button>
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
