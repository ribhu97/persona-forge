export interface User {
    id: number;
    email: string;
    name?: string;
    is_verified: boolean;
    auth_provider: string;
    account_type: number;  // 0=Free, 1=Admin, future tiers
}

// Account type constants for clarity
export const AccountType = {
    FREE: 0,
    PLUS: 1,
    PRO: 2,
    ADMIN: 99,
} as const;

export interface LoginResponse {
    access_token: string;
    token_type: string;
}

export interface SignupResponse {
    message: string;
}
