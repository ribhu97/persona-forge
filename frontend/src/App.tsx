import { useState, useEffect } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { usePersonaStore } from '@/stores/personaStore';
import { GoogleOAuthProvider } from '@react-oauth/google';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export type AppOutletContext = {
  onLogin: () => void;
};

export function useAppContext() {
  return useOutletContext<AppOutletContext>();
}

// Root layout — provides HelmetProvider, GoogleOAuth, AuthDialog, and auth lifecycle
export default function AppLayout() {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Gate client-only components (AuthDialog, GoogleOAuthProvider) behind mount state.
  // useEffect never runs during SSG, so isMounted stays false for pre-rendered HTML.
  useEffect(() => setIsMounted(true), []);

  // Rehydrate Zustand persist store and check auth on mount (browser-only)
  useEffect(() => {
    useAuthStore.persist.rehydrate();
    checkAuth();
  }, [checkAuth]);

  // Listen for openAuthDialog custom event (fired from ChatInterface, ExportDialog, etc.)
  useEffect(() => {
    const handleOpenAuthDialog = () => setIsAuthDialogOpen(true);
    window.addEventListener('openAuthDialog', handleOpenAuthDialog);
    return () => window.removeEventListener('openAuthDialog', handleOpenAuthDialog);
  }, []);

  // Handle logout cleanup
  useEffect(() => {
    if (!isAuthenticated) {
      useChatStore.getState().reset();
      usePersonaStore.getState().clearAll();
    }
  }, [isAuthenticated]);

  const openLogin = () => setIsAuthDialogOpen(true);

  const content = (
    <HelmetProvider>
      <Outlet context={{ onLogin: openLogin } satisfies AppOutletContext} />
      {isMounted && <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />}
    </HelmetProvider>
  );

  // GoogleOAuthProvider also requires browser APIs — only mount after hydration
  if (!isMounted || !googleClientId) return content;

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      {content}
    </GoogleOAuthProvider>
  );
}
