import { expect, mock, test } from 'bun:test';

type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Handler>();
let killed = false;

const command = {
    outputOptions: () => command,
    toFormat: () => command,
    on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
        return command;
    },
    save: () => command,
    kill: () => {
        killed = true;
        return command;
    }
};

await mock.module('fluent-ffmpeg', () => ({ default: () => command }));

const { MediaProcessorService } = await import('../src/chat/media-processor.service.js');

test('stalled video transcoding is killed and rejects instead of hanging', async () => {
    const service = new MediaProcessorService();
    (service as unknown as { timeoutMs: number }).timeoutMs = 60;

    const outcome = await Promise.race([
        service.processVideo('/tmp/in.mp4', '/tmp/out.mp4').then(
            () => 'resolved',
            () => 'rejected'
        ),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 1000))
    ]);

    expect(outcome).toBe('rejected');
    expect(killed).toBe(true);
});
