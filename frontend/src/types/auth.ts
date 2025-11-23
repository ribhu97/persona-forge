export interface User {
    id: number;
    email: string;
    name?: string;
    is_verified: boolean;
    auth_provider: string;
}

export interface LoginResponse {
    access_token: string;
    token_type: string;
}

export interface SignupResponse {
    message: string;
}
