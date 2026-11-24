import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

export const eventRoom = (eventId: number) => `event:${eventId}`;

type ChatAccessRevokedHandler = (eventId: number, userIds: number[]) => void;

/**
 * Tells clients watching an event that it changed. The payload is only a signal:
 * event responses are per-viewer, so each client refetches through the API.
 */
@Injectable()
export class EventsRealtime {
    private server: Server | null = null;
    private chatAccessRevokedHandler: ChatAccessRevokedHandler | null = null;

    attach(server: Server) {
        this.server = server;
    }

    /** The chat gateway registers a handler that evicts sockets from revoked rooms. */
    onChatAccessRevoked(handler: ChatAccessRevokedHandler) {
        this.chatAccessRevokedHandler = handler;
    }

    revokeChatAccess(eventId: number, userIds: number[]) {
        if (userIds.length === 0) return;
        this.chatAccessRevokedHandler?.(eventId, userIds);
    }

    eventChanged(eventId: number) {
        this.server?.to(eventRoom(eventId)).emit('eventChanged', { eventId });
    }

    /** Chat traffic is already pushed to the chat room; this reaches viewers who only show a preview. */
    chatChanged(eventId: number) {
        this.server?.to(eventRoom(eventId)).emit('chatChanged', { eventId });
    }
}
