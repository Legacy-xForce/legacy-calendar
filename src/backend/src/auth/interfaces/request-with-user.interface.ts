import type { Request } from 'express';
import type { ApiTokenScope } from '../../../prisma/generated/client.js';

export type AuthMethod = 'session' | 'api-token';

export interface RequestWithUser extends Request {
    user: {
        userId?: number;
        id?: number;
        username: string;
        isAdmin: boolean;
    };
    impersonatorUserId?: number | null;
    /** How the current request was authenticated. */
    authMethod?: AuthMethod;
    /** Set when the request authenticated with X-API-Token. */
    apiTokenId?: number;
    apiTokenScope?: ApiTokenScope;
}
