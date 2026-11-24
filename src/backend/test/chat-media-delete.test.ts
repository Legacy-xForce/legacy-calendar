import { expect, test } from 'bun:test';
import { writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as path from 'path';
import { ChatService } from '../src/chat/chat.service.js';
import type { ChatRepository, ChatMessageWithRelations } from '../src/chat/chat.repository.js';
import type { EventsRepository } from '../src/events/events.repository.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import { ChatMediaType } from '../prisma/generated/client.js';

test('deleting a message cannot delete a file outside its chat uploads directory', async () => {
    const victim = join('/tmp/opencode', `chat-media-delete-${crypto.randomUUID()}.txt`);
    writeFileSync(victim, 'do not delete me');

    // A socket client can store any string as mediaUrl; this one escapes uploads/.
    const mediaUrl = relative(process.cwd(), victim);
    const message = {
        id: 42,
        eventId: 7,
        authorId: 5,
        text: null,
        mediaUrl,
        mediaType: ChatMediaType.image,
        isPinned: false,
        isEdited: false,
        createdAt: new Date(),
        updatedAt: new Date()
    } as ChatMessageWithRelations;

    const chatRepo = {
        findMessageById: () => Promise.resolve(message),
        deleteMessage: () => Promise.resolve(message)
    } as unknown as ChatRepository;
    const eventsRepo = {
        findChatAccessById: () => Promise.resolve({ hostId: 999 })
    } as unknown as EventsRepository;
    const notifications = {} as NotificationsService;
    const service = new ChatService(chatRepo, eventsRepo, notifications);

    await service.deleteMessage(message.id, message.authorId, false);

    expect(path.resolve(process.cwd(), mediaUrl)).toBe(victim);
    expect(existsSync(victim)).toBe(true);
    rmSync(victim, { force: true });
});
