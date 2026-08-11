import type { User } from './User';

export interface Session {
    token: string;
    refreshToken?: string;
    user?: User;
}
