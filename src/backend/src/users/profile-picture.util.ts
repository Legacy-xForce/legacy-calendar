import { getAuthHost } from '../config/auth-host.js';

export function buildProfilePictureUrl(authId: string | null | undefined): string | null {
    return authId ? `${getAuthHost()}/auth/profile-picture/${authId}` : null;
}
