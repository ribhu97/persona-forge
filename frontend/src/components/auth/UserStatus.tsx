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
            <Button variant="outline" onClick={onLoginClick}>
                Sign In
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <UserIcon className="h-4 w-4 text-primary" />
                    </div>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="w-56 bg-white/90 backdrop-blur-sm z-50"
                align="end"
                forceMount
            >
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                            {user?.account_type === AccountType.PLUS && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary/20 text-primary rounded-full border border-primary/30">
                                    PLUS
                                </span>
                            )}
                            {user?.account_type === AccountType.PRO && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                                    PRO
                                </span>
                            )}
                            {user?.account_type === AccountType.ADMIN && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full border border-primary/50">
                                    ADMIN
                                </span>
                            )}
                            {user?.account_type === AccountType.FREE && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground rounded-full border border-border">
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
