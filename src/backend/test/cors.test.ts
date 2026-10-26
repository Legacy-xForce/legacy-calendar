import { describe, expect, test } from 'bun:test';
import { isOriginAllowed } from '../src/config/cors.js';

describe('CORS origin allowlist', () => {
    test('allows the tracker web origin and its preview subdomains', () => {
        expect(isOriginAllowed('https://legacytracker.pages.dev')).toBe(true);
        expect(isOriginAllowed('https://abc123.legacytracker.pages.dev')).toBe(true);
        expect(isOriginAllowed('http://legacytracker.pages.dev')).toBe(false);
    });

    test('keeps allowing local development origins', () => {
        expect(isOriginAllowed('http://localhost:5173')).toBe(true);
        expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
    });

    test('allows configured frontend origins and their subdomains', () => {
        const previous = process.env.FRONTEND_URL;
        process.env.FRONTEND_URL = 'https://calendar.example.com';
        try {
            expect(isOriginAllowed('https://calendar.example.com')).toBe(true);
            expect(isOriginAllowed('https://app.calendar.example.com')).toBe(true);
            expect(isOriginAllowed('http://calendar.example.com')).toBe(false);
            expect(isOriginAllowed('https://calendar.example.com:8443')).toBe(false);
        } finally {
            if (previous === undefined) delete process.env.FRONTEND_URL;
            else process.env.FRONTEND_URL = previous;
        }
    });

    test('rejects unrelated origins', () => {
        expect(isOriginAllowed('https://evil.example')).toBe(false);
        expect(isOriginAllowed('https://legacytracker.pages.dev.evil.example')).toBe(false);
    });
});
