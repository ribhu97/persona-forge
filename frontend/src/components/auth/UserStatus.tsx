import { LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/stores/authStore';
import { AccountType } from '@/types/auth'; // Import AccountType

// I'll use a styled span for simplicity as I didn't check for Badge component.

interface UserStatusProps {
    onLoginClick: () => void;
}

export function UserStatus({ onLoginClick }: UserStatusProps) {
    const { user, isAuthenticated, logout } = useAuthStore();

    if (!isAuthenticated) {
        return (
            <Button
                variant="ghost"
                size="sm"
                onClick={onLoginClick}
                className="terminal-prompt text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                Sign In
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="default" size="icon" className="h-8 w-8" aria-label="Account menu">
                    <UserIcon className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="z-[90] w-56 border-2 border-border bg-popover text-popover-foreground shadow-[5px_5px_0_hsl(var(--foreground)/0.8)]"
                align="end"
                forceMount
            >
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                            {user?.account_type === AccountType.PLUS && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary/20 text-primary rounded-none border border-primary/30">
                                    PLUS
                                </span>
                            )}
                            {user?.account_type === AccountType.PRO && (
                                <span className="border border-signal-mood/40 bg-signal-mood/10 px-1.5 py-0.5 text-[10px] font-bold text-signal-mood">
                                    PRO
                                </span>
                            )}
                            {user?.account_type === AccountType.ADMIN && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary text-primary-foreground rounded-none border border-primary/50">
                                    ADMIN
                                </span>
                            )}
                            {user?.account_type === AccountType.FREE && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground rounded-none border border-border">
                                    FREE
                                </span>
                            )}
                        </div>
                        <p className="text-xs leading-none text-muted-foreground">
                            {user?.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
