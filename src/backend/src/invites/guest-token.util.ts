import { randomBytes, createHash } from 'crypto';

export function generateGuestToken(): string {
    return randomBytes(32).toString('base64url');
}

export function hashGuestToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
