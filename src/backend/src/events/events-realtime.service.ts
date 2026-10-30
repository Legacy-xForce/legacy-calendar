import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

export const eventRoom = (eventId: number) => `event:${eventId}`;

/**
 * Tells clients watching an event that it changed. The payload is only a signal:
 * event responses are per-viewer, so each client refetches through the API.
 */
@Injectable()
export class EventsRealtime {
    private server: Server | null = null;

    attach(server: Server) {
        this.server = server;
    }

    eventChanged(eventId: number) {
        this.server?.to(eventRoom(eventId)).emit('eventChanged', { eventId });
    }

    /** Chat traffic is already pushed to the chat room; this reaches viewers who only show a preview. */
    chatChanged(eventId: number) {
        this.server?.to(eventRoom(eventId)).emit('chatChanged', { eventId });
    }
}
