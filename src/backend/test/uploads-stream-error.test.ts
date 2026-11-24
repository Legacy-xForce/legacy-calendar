import { expect, mock, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

const uploadsDir = join(process.cwd(), 'uploads');
const testFile = join(uploadsDir, 'stream-error-test.txt');
mkdirSync(uploadsDir, { recursive: true });
writeFileSync(testFile, 'payload');

const realFs = await import('fs');
await mock.module('fs', () => ({
    ...realFs,
    createReadStream: () => {
        const stream = new PassThrough();
        queueMicrotask(() => stream.emit('error', new Error('simulated read failure')));
        return stream;
    }
}));

const { UploadsController } = await import('../src/uploads/uploads.controller.js');

type FakeResponse = EventEmitter & {
    statusCode: number;
    headersSent?: boolean;
    set: (field: string, value?: string) => FakeResponse;
    status: (code: number) => FakeResponse;
    end: () => FakeResponse;
    redirect: (url: string) => FakeResponse;
    destroy: (error?: Error) => FakeResponse;
};

function fakeResponse(): FakeResponse {
    const response = new EventEmitter() as FakeResponse;
    response.statusCode = 200;
    response.set = () => response;
    response.status = (code: number) => {
        response.statusCode = code;
        return response;
    };
    response.end = () => response;
    response.redirect = () => response;
    response.destroy = () => response;
    return response;
}

test('a read-stream error is turned into a response error', async () => {
    const controller = new UploadsController({ get: () => undefined } as unknown as ConfigService);
    const response = fakeResponse();

    controller.getUpload(
        'stream-error-test.txt',
        { headers: {} } as unknown as Request,
        response as unknown as Response
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(response.statusCode).toBe(500);
    rmSync(testFile, { force: true });
});
