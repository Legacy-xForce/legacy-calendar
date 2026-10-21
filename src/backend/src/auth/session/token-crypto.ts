import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for the OIDC tokens stored with a session, so a leaked table or
 * backup holds nothing a thief can refresh. Format: `v1.<iv>.<tag>.<ciphertext>`
 * (base64url parts).
 */

const VERSION = 'v1';

export function encryptToken(plaintext: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
        VERSION,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url')
    ].join('.');
}

export function decryptToken(stored: string, key: Buffer): string {
    const [version, iv, tag, ciphertext] = stored.split('.');
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
        throw new Error('Unreadable stored token');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
