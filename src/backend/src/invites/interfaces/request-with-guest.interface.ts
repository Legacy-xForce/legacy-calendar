import type { Request } from 'express';
import type { GuestInviteWithRelations } from '../invites.repository.js';

export interface RequestWithGuestInvite extends Request {
    guestInvite: GuestInviteWithRelations;
}
