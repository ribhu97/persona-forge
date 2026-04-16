import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authAPI } from '@/lib/api';
import type { User } from '@/types';

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    setToken: (token: string) => void;
    setUser: (user: User) => void;
    logout: () => void;
    checkAuth: () => Promise<void>;
    setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,

            setToken: (token) => {
                localStorage.setItem('token', token);
                set({ token, isAuthenticated: true });
            },

            setUser: (user) => set({ user }),

            logout: () => {
                localStorage.removeItem('token');
                set({ user: null, token: null, isAuthenticated: false });
            },

            checkAuth: async () => {
                const token = get().token;
                if (!token) return;

                set({ isLoading: true });
                try {
                    const user = await authAPI.me();
                    set({ user, isAuthenticated: true });
                } catch (err) {
                    console.error('Auth check failed:', err);
                    get().logout();
                } finally {
                    set({ isLoading: false });
                }
            },

            setError: (error) => set({ error }),
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' ? localStorage : noopStorage
            ),
            partialize: (state) => ({ token: state.token }),
            skipHydration: true,
        }
    )
);
