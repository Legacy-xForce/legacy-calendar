import { CanActivate, ExecutionContext, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InvitesRepository } from '../invites.repository.js';
import { hashGuestToken } from '../guest-token.util.js';
import type { RequestWithGuestInvite } from '../interfaces/request-with-guest.interface.js';

@Injectable()
export class GuestTokenGuard implements CanActivate {
    constructor(@Inject(InvitesRepository) private readonly invitesRepo: InvitesRepository) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithGuestInvite>();
        const rawToken = request.params.token;
        const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

        if (!token) {
            throw new NotFoundException('Invite not found');
        }

        const guestInvite = await this.invitesRepo.findByTokenHash(hashGuestToken(token));
        if (!guestInvite) {
            throw new NotFoundException('Invite not found');
        }

        // Expiry only blocks edits (enforced in InvitesService), not viewing -
        // guests should retain the same read access a regular participant keeps
        // after the deadline passes.
        request.guestInvite = guestInvite;
        return true;
    }
}
