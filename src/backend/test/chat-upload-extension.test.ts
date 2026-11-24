import { expect, test } from 'bun:test';
import { ChatController } from '../src/chat/chat.controller.js';
import type { ChatService } from '../src/chat/chat.service.js';
import type { MediaProcessorService } from '../src/chat/media-processor.service.js';
import type { ChatMediaType } from '../prisma/generated/client.js';

type UploadInfo = { mediaType: ChatMediaType; ext: string };

function resolveUpload(originalname: string, mimetype: string): UploadInfo {
    const controller = new ChatController({} as ChatService, {} as MediaProcessorService);
    const resolve = (controller as unknown as { resolveMediaUpload: (file: Express.Multer.File) => UploadInfo })
        .resolveMediaUpload;
    return resolve.call(controller, { originalname, mimetype } as unknown as Express.Multer.File);
}

test('GIF uploads never reuse a client-controlled, executable extension', () => {
    expect(resolveUpload('payload.html', 'image/gif').ext).toBe('.gif');
});

test('audio uploads derive their extension from the MIME type, not the filename', () => {
    expect(resolveUpload('payload.html', 'audio/mpeg').ext).toBe('.mp3');
});

test('a normal audio filename still resolves as before', () => {
    expect(resolveUpload('clip.mp3', 'audio/mpeg').ext).toBe('.mp3');
});
