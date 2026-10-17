export interface AuthLoginDto {
    username: string;
    password: string;
}

export interface AuthTokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
}

export interface ChangePasswordDto {
    currentPassword: string;
    newPassword: string;
}
