import { expect, test } from 'bun:test';

const originalClipboard = globalThis.navigator?.clipboard;

function setClipboard(writeText: (value: string) => Promise<void>) {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
        configurable: true,
        value: { writeText }
    });
}

test('copyText reports success', async () => {
    setClipboard(() => Promise.resolve());
    const { copyText } = await import('../src/utils/clipboard.js');

    expect(await copyText('value')).toBe(true);
});

test('copyText handles denied clipboard access without rejecting', async () => {
    setClipboard(() => Promise.reject(new Error('denied')));
    const { copyText } = await import('../src/utils/clipboard.js');

    expect(await copyText('value')).toBe(false);
});

test('copyText handles missing clipboard API', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: undefined });
    const { copyText } = await import('../src/utils/clipboard.js');

    expect(await copyText('value')).toBe(false);
    if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: originalClipboard });
    }
});
