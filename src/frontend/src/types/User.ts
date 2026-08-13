export interface CreateUserDto {
    username: string;
    password: string;
    isAdmin?: boolean;
}

export interface UpdateUserDto {
    username?: string;
    password?: string;
    isAdmin?: boolean;
}

export interface User {
    id: number;
    username: string;
    profilePictureUrl?: string | null;
    isAdmin: boolean;
    isGuest?: boolean;
}
