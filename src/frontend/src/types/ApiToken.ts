export type ApiTokenScope = 'read' | 'write';

export interface ApiToken {
    id: number;
    name: string;
    scope: ApiTokenScope;
    tokenHint: string;
    createdAt: string;
    lastUsedAt: string | null;
    rotatedAt: string | null;
}

export interface CreatedApiToken extends ApiToken {
    token: string;
}

export interface CreateApiTokenDto {
    name?: string;
    scope: ApiTokenScope;
}
