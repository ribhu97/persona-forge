import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/authStore';
import { authAPI } from '@/lib/api';

interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type AuthMode = 'login' | 'signup';
type SignupStep = 'details' | 'otp';

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
    const [mode, setMode] = useState<AuthMode>('login');
    const [signupStep, setSignupStep] = useState<SignupStep>('details');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [otp, setOtp] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { setToken, setUser } = useAuthStore();

    const resetForm = () => {
        setEmail('');
        setPassword('');
        setName('');
        setOtp('');
        setError(null);
        setSignupStep('details');
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            resetForm();
        }
        onOpenChange(newOpen);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            if (mode === 'login') {
                const response = await authAPI.login({ email, password });
                setToken(response.access_token);
                const user = await authAPI.me();
                setUser(user);
                handleOpenChange(false);
            } else {
                if (signupStep === 'details') {
                    await authAPI.signup({ email, password, name });
                    setSignupStep('otp');
                } else {
                    const response = await authAPI.verifyOtp({ email, otp });
                    setToken(response.access_token);
                    const user = await authAPI.me();
                    setUser(user);
                    handleOpenChange(false);
                }
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSuccess = async (tokenResponse: any) => {
        setError(null);
        setIsLoading(true);
        try {
            // Support both credential (ID token) and access_token
            const token = tokenResponse.credential || tokenResponse.access_token;
            if (token) {
                const response = await authAPI.googleLogin(token);
                setToken(response.access_token);
                const user = await authAPI.me();
                setUser(user);
                handleOpenChange(false);
            }
        } catch (err: any) {
            setError(err.message || 'Google login failed');
        } finally {
            setIsLoading(false);
        }
    };

    const googleLogin = useGoogleLogin({
        onSuccess: handleGoogleSuccess,
        onError: () => setError('Google Login Failed'),
    });

    const toggleMode = () => {
        setMode(mode === 'login' ? 'signup' : 'login');
        resetForm();
    };

    return (
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
                    <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                        <Dialog.Title className="text-lg font-semibold leading-none tracking-tight">
                            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                        </Dialog.Title>
                        <Dialog.Description className="text-sm text-muted-foreground">
                            {mode === 'login'
                                ? 'Enter your credentials to access your account'
                                : signupStep === 'details'
                                    ? 'Enter your details to create a new account'
                                    : 'Enter the OTP sent to your email'}
                        </Dialog.Description>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                                {error}
                            </div>
                        )}

                        {mode === 'signup' && signupStep === 'otp' ? (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">OTP Code</label>
                                <Input
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    placeholder="Enter 6-digit code"
                                    required
                                />
                            </div>
                        ) : (
                            <>
                                {mode === 'signup' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Name</label>
                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="John Doe"
                                            required
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Email</label>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="john@example.com"
                                        required
                                        disabled={mode === 'signup' && signupStep === 'otp'}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Password</label>
                                    <Input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </>
                        )}
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-center w-full">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full relative"
                                onClick={() => googleLogin()}
                                disabled={isLoading}
                            >
                                <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                                    <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                                </svg>
                                Sign in with Google
                            </Button>
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? 'Please wait...' : (
                                    mode === 'login' ? 'Sign In' : (
                                        signupStep === 'details' ? 'Sign Up' : 'Verify OTP'
                                    )
                                )}
                            </Button>

                            <div className="text-center text-sm text-muted-foreground">
                                {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                                <button
                                    type="button"
                                    onClick={toggleMode}
                                    className="text-primary hover:underline font-medium"
                                >
                                    {mode === 'login' ? 'Sign Up' : 'Sign In'}
                                </button>
                            </div>
                        </div>
                    </form>

                    <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
