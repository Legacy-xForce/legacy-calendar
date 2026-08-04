const AUTH_HOST = process.env.AUTH_HOST || 'https://auth.legacy-group.tech';

export function buildProfilePictureUrl(authId: string | null | undefined): string | null {
    return authId ? `${AUTH_HOST}/auth/profile-picture/${authId}` : null;
}
