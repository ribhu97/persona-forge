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
    ADMIN: 1,
    // Future: PRO: 2, ENTERPRISE: 3
} as const;

export interface LoginResponse {
    access_token: string;
    token_type: string;
}

export interface SignupResponse {
    message: string;
}
