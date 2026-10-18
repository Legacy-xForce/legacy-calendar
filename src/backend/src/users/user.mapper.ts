import { UserDto } from './dto/user.dto.js';
import { buildProfilePictureUrl } from './profile-picture.util.js';

export type MappableUser = {
    id: number;
    username: string;
    isAdmin: boolean;
    authId: string | null;
    paypalLink?: string | null;
    ibanNumber?: string | null;
    ibanAccountHolder?: string | null;
    revolutLink?: string | null;
};

/** Public shape of a registered user. */
export function mapUserToDto(user: MappableUser, options: { includePaymentInfo?: boolean } = {}): UserDto {
    const dto: UserDto = {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        profilePictureUrl: buildProfilePictureUrl(user.authId),
        isGuest: false
    };

    if (options.includePaymentInfo) {
        dto.paypalLink = user.paypalLink;
        dto.ibanNumber = user.ibanNumber;
        dto.ibanAccountHolder = user.ibanAccountHolder;
        dto.revolutLink = user.revolutLink;
    }

    return dto;
}

/** Public shape of a magic-link guest identified by a negative namespaced id. */
export function mapGuestToDto(id: number, displayName: string): UserDto {
    return {
        id,
        username: displayName,
        isAdmin: false,
        profilePictureUrl: null,
        isGuest: true
    };
}
