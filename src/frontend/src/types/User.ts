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

export interface UpdatePaymentInfoDto {
    paypalLink?: string;
    ibanNumber?: string;
    ibanAccountHolder?: string;
    revolutLink?: string;
}

export interface PaymentInfo {
    paypalLink?: string | null;
    ibanNumber?: string | null;
    ibanAccountHolder?: string | null;
    revolutLink?: string | null;
}

export interface User extends PaymentInfo {
    id: number;
    username: string;
    profilePictureUrl?: string | null;
    isAdmin: boolean;
    isGuest?: boolean;
}
