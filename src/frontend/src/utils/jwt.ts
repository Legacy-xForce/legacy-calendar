/** Decode a JWT payload without verifying the signature. Returns null when unreadable. */
export function parseJwtPayload(token: string): any {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        base64 += '='.repeat((4 - (base64.length % 4)) % 4);
        const json = decodeURIComponent(
            window
                .atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
}
