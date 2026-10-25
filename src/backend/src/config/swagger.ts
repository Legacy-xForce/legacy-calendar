import { DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;

/** Endpoints that deliberately reject API tokens and require a login session. */
const SESSION_ONLY_PATH_PREFIXES = ['/api-tokens'];

type SwaggerOperation = {
    security?: Record<string, string[]>[];
};

type SwaggerPathItem = Partial<Record<(typeof HTTP_METHODS)[number], SwaggerOperation>>;

type SwaggerDocument = OpenAPIObject & {
    paths: Record<string, SwaggerPathItem>;
};

export function createSwaggerConfig() {
    return new DocumentBuilder()
        .setTitle('Legacy Calendar API')
        .setDescription(
            [
                'The Legacy Calendar server API.',
                '',
                'Most endpoints accept either a normal session token (`Authorization: Bearer <jwt>`) or a personal',
                'API token (`X-API-Token: legacy-calendar-…`). API tokens are created from the profile page and',
                'carry a `read` or `write` scope. Read-only tokens may only perform `GET`/`HEAD`/`OPTIONS` requests',
                'and `POST /auth/profile`. Token management under `/api-tokens` always requires a session token.',
                '',
                '## Chat socket',
                '',
                'Event chat also runs over Socket.IO at the API origin. Authenticate the handshake with either a session',
                'token (`auth.token`) or an API token (`auth.apiToken` or the `X-API-Token` header), then join the event',
                'room with `joinRoom`; the server checks that you participate in the event.',
                '',
                '| Client event | Body | Broadcast to the room |',
                '| --- | --- | --- |',
                '| `joinRoom` / `leaveRoom` | `{ eventId }` | — |',
                '| `sendMessage` | `{ eventId, text?, mediaUrl?, mediaType? }` | `newMessage` |',
                '| `editMessage` | `{ messageId, text }` | `messageEdited` |',
                '| `deleteMessage` | `{ messageId }` | `messageDeleted` |',
                '| `addReaction` | `{ messageId, emoji }` | `reactionUpdated` |',
                '| `pinMessage` / `unpinMessage` | `{ messageId }` | `messagePinned` / `messageUnpinned` |',
                '| `typing` / `stopTyping` | `{ eventId }` | `userTyping` / `userStoppedTyping` |',
                '',
                'Read-only API tokens may join rooms and receive events but cannot send mutations. Failures arrive as an',
                '`error` event with `{ code, message }`.'
            ].join('\n')
        )
        .setVersion('1.0')
        .addBearerAuth()
        .addApiKey(
            {
                type: 'apiKey',
                in: 'header',
                name: 'X-API-Token',
                description: 'Personal API token generated from the profile page'
            },
            'api-token'
        )
        .build();
}

/**
 * Operations annotated with @ApiBearerAuth() accept both credential types.
 * OpenAPI expresses alternatives as separate security requirement objects, so
 * add the API-token scheme next to bearer rather than replacing it.
 */
export function addApiTokenSecurity(document: OpenAPIObject): OpenAPIObject {
    const swaggerDocument = document as SwaggerDocument;

    for (const [path, pathItem] of Object.entries(swaggerDocument.paths)) {
        if (SESSION_ONLY_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
            continue;
        }

        for (const method of HTTP_METHODS) {
            const operation = pathItem[method];
            if (!operation?.security) {
                continue;
            }

            const acceptsBearer = operation.security.some((requirement) =>
                Object.prototype.hasOwnProperty.call(requirement, 'bearer')
            );
            const alreadyHasApiToken = operation.security.some((requirement) =>
                Object.prototype.hasOwnProperty.call(requirement, 'api-token')
            );

            if (acceptsBearer && !alreadyHasApiToken) {
                operation.security.push({ 'api-token': [] });
            }
        }
    }

    return document;
}
