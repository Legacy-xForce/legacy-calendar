export function isPasskeySupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        window.PublicKeyCredential !== undefined &&
        typeof window.PublicKeyCredential === 'function'
    );
}

export function base64urlToBuffer(base64url: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
    const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer;
}

export function bufferToBase64url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface RegisterOptions {
    challenge: string;
    rp: { name: string; id?: string };
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: { alg: number; type: 'public-key' }[];
    timeout?: number;
    attestation?: AttestationConveyancePreference;
    authenticatorSelection?: AuthenticatorSelectionCriteria;
}

export async function createPasskeyCredential(options: RegisterOptions) {
    const publicKey: PublicKeyCredentialCreationOptions = {
        challenge: base64urlToBuffer(options.challenge),
        rp: options.rp,
        user: {
            id: base64urlToBuffer(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName
        },
        pubKeyCredParams: options.pubKeyCredParams as PublicKeyCredentialParameters[],
        timeout: options.timeout ?? 60000,
        attestation: options.attestation ?? 'none',
        authenticatorSelection: options.authenticatorSelection
    };

    const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
    if (!credential) {
        throw new Error('Failed to create passkey credential');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const clientDataJSON = bufferToBase64url(response.clientDataJSON);
    const attestationObject = bufferToBase64url(response.attestationObject);
    let publicKeyBase64: string | undefined = undefined;

    if (typeof (response as any).getPublicKey === 'function') {
        const pkBuffer = (response as any).getPublicKey();
        if (pkBuffer) {
            publicKeyBase64 = bufferToBase64url(pkBuffer);
        }
    }

    return {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        response: {
            clientDataJSON,
            attestationObject,
            publicKey: publicKeyBase64,
            transports: (response as any).getTransports ? (response as any).getTransports() : undefined
        }
    };
}

export interface LoginOptions {
    challenge: string;
    timeout?: number;
    userVerification?: UserVerificationRequirement;
    allowCredentials?: { id: string; type: 'public-key' }[];
}

export async function getPasskeyAssertion(options: LoginOptions) {
    const allowCredentials = options.allowCredentials?.map((cred) => ({
        id: base64urlToBuffer(cred.id),
        type: cred.type as 'public-key'
    }));

    const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: base64urlToBuffer(options.challenge),
        timeout: options.timeout ?? 60000,
        userVerification: options.userVerification ?? 'preferred',
        allowCredentials
    };

    const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
    if (!assertion) {
        throw new Error('Failed to get passkey assertion');
    }

    const response = assertion.response as AuthenticatorAssertionResponse;
    const clientDataJSON = bufferToBase64url(response.clientDataJSON);
    const authenticatorData = bufferToBase64url(response.authenticatorData);
    const signature = bufferToBase64url(response.signature);
    const userHandle = response.userHandle ? bufferToBase64url(response.userHandle) : undefined;

    return {
        id: assertion.id,
        rawId: bufferToBase64url(assertion.rawId),
        response: {
            clientDataJSON,
            authenticatorData,
            signature,
            userHandle
        }
    };
}
