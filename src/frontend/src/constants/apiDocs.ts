export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'WS';

export type ApiAuthKind = 'public' | 'authenticated' | 'session-only' | 'guest';

export type ApiScope = 'read' | 'write';

export interface ApiDocParam {
    name: string;
    in: 'path' | 'query' | 'header' | 'body';
    type: string;
    required?: boolean;
    description: string;
}

export interface ApiDocEndpoint {
    id: string;
    method: ApiMethod;
    path: string;
    title: string;
    description: string;
    auth: ApiAuthKind;
    scope?: ApiScope | 'session';
    params?: ApiDocParam[];
    body?: string;
    response?: string;
    notes?: string[];
}

export interface ApiDocGroup {
    id: string;
    title: string;
    summary: string;
    icon: string;
    endpoints: ApiDocEndpoint[];
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

export const API_AUTH_HEADER = 'X-API-Token';
export const API_TOKEN_EXAMPLE = 'legacy-calendar-01a15968-64aa-707d-8904-a6a408611289';

export const API_DOC_GROUPS: ApiDocGroup[] = [
    {
        id: 'tokens',
        title: 'API tokens',
        summary: 'Create, rotate and delete personal credentials. These endpoints always require a login session.',
        icon: 'pi pi-key',
        endpoints: [
            {
                id: 'list-api-tokens',
                method: 'GET',
                path: '/api-tokens',
                title: 'List API tokens',
                description:
                    'Returns metadata for every token owned by the authenticated user. Full token values are never returned here.',
                auth: 'session-only',
                scope: 'session',
                response: json([
                    {
                        id: 7,
                        name: 'Home Assistant',
                        scope: 'read',
                        tokenHint: 'legacy-calendar-01a1…1289',
                        createdAt: '2026-10-20T12:00:00.000Z',
                        lastUsedAt: '2026-10-20T18:42:11.000Z',
                        rotatedAt: null
                    }
                ]),
                notes: ['API tokens receive 403 here; use a normal session token.']
            },
            {
                id: 'create-api-token',
                method: 'POST',
                path: '/api-tokens',
                title: 'Create an API token',
                description:
                    'Creates a new long-lived token. The full value is returned once in this response and only its hash is stored.',
                auth: 'session-only',
                scope: 'session',
                body: json({ name: 'Home Assistant', scope: 'read' }),
                response: json({
                    id: 7,
                    name: 'Home Assistant',
                    scope: 'read',
                    tokenHint: 'legacy-calendar-01a1…1289',
                    createdAt: '2026-10-20T12:00:00.000Z',
                    lastUsedAt: null,
                    rotatedAt: null,
                    token: API_TOKEN_EXAMPLE
                }),
                params: [
                    {
                        name: 'name',
                        in: 'body',
                        type: 'string',
                        description: 'Label, 1-60 characters. Defaults to "API token".'
                    },
                    {
                        name: 'scope',
                        in: 'body',
                        type: '"read" | "write"',
                        required: true,
                        description: 'Capability of the new token.'
                    }
                ],
                notes: ['A user may hold at most 25 tokens. Delete one before creating more.']
            },
            {
                id: 'rotate-api-token',
                method: 'POST',
                path: '/api-tokens/{id}/rotate',
                title: 'Rotate an API token',
                description: 'Replaces the token value. The previous value stops working immediately.',
                auth: 'session-only',
                scope: 'session',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Token id.' }],
                response: json({
                    id: 7,
                    name: 'Home Assistant',
                    scope: 'read',
                    tokenHint: 'legacy-calendar-c0de…beef',
                    createdAt: '2026-10-20T12:00:00.000Z',
                    lastUsedAt: null,
                    rotatedAt: '2026-10-21T09:30:00.000Z',
                    token: 'legacy-calendar-c0de0000-1111-2222-3333-4444beefbeef'
                }),
                notes: ['The response is your only chance to copy the new value.']
            },
            {
                id: 'delete-api-token',
                method: 'DELETE',
                path: '/api-tokens/{id}',
                title: 'Delete an API token',
                description: 'Permanently revokes a token. Any integration using it stops working immediately.',
                auth: 'session-only',
                scope: 'session',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Token id.' }],
                response: json({ success: true })
            }
        ]
    },
    {
        id: 'auth',
        title: 'Authentication & profile',
        summary:
            'Profile lookup, password changes and WebAuthn passkeys. Login itself happens in the Legacy auth service.',
        icon: 'pi pi-user',
        endpoints: [
            {
                id: 'get-profile',
                method: 'POST',
                path: '/auth/profile',
                title: 'Get the current profile',
                description:
                    'Returns the local account for the authenticated identity. This is a POST for historical reasons but is treated as a read operation, so read-only API tokens may call it.',
                auth: 'authenticated',
                scope: 'read',
                response: json({
                    id: 1,
                    username: 'alice',
                    isAdmin: false,
                    profilePictureUrl:
                        'https://auth.legacy-group.tech/auth/profile-picture/4a41d722-9bc3-407b-b3b1-e15d22b05463',
                    isGuest: false,
                    paypalLink: null,
                    ibanNumber: null,
                    ibanAccountHolder: null,
                    revolutLink: null
                })
            },
            {
                id: 'change-password',
                method: 'POST',
                path: '/auth/change-password',
                title: 'Change the account password',
                description: 'Proxies the password change to the Legacy auth service.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ currentPassword: 'current-password', newPassword: 'new-password' }),
                notes: ['Limited to 10 requests per minute per client.']
            },
            {
                id: 'passkey-register-options',
                method: 'POST',
                path: '/auth/passkey/register-options',
                title: 'Start passkey registration',
                description: 'Returns WebAuthn creation options for the current account.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ deviceName: 'MacBook Touch ID' })
            },
            {
                id: 'passkey-register-verify',
                method: 'POST',
                path: '/auth/passkey/register-verify',
                title: 'Finish passkey registration',
                description: 'Verifies the WebAuthn attestation and stores the credential.',
                auth: 'authenticated',
                scope: 'write',
                body: json({
                    id: 'credential-id',
                    rawId: 'credential-id',
                    response: { clientDataJSON: '…', publicKey: '…', transports: ['internal'] },
                    deviceName: 'MacBook Touch ID'
                })
            },
            {
                id: 'passkey-list',
                method: 'GET',
                path: '/auth/passkey/credentials',
                title: 'List passkeys',
                description: 'Lists the passkeys registered on the current account.',
                auth: 'authenticated',
                scope: 'read',
                response: json([
                    { id: 'credential-id', deviceName: 'MacBook Touch ID', createdAt: '2026-10-20T12:00:00.000Z' }
                ])
            },
            {
                id: 'passkey-delete',
                method: 'DELETE',
                path: '/auth/passkey/credentials/{id}',
                title: 'Delete a passkey',
                description: 'Removes one of the current account passkeys.',
                auth: 'authenticated',
                scope: 'write',
                params: [
                    { name: 'id', in: 'path', type: 'string', required: true, description: 'WebAuthn credential id.' }
                ]
            },
            {
                id: 'passkey-login-options',
                method: 'POST',
                path: '/auth/passkey/login-options',
                title: 'Start passkey login',
                description:
                    'Public endpoint that returns WebAuthn assertion options. Username is optional for discoverable passkeys.',
                auth: 'public',
                body: json({ username: 'alice' })
            },
            {
                id: 'passkey-login-verify',
                method: 'POST',
                path: '/auth/passkey/login-verify',
                title: 'Finish passkey login',
                description:
                    'Public endpoint that verifies the assertion and returns an access token and refresh token.',
                auth: 'public',
                body: json({
                    id: 'credential-id',
                    rawId: 'credential-id',
                    response: { clientDataJSON: '…', authenticatorData: '…', signature: '…', userHandle: '…' }
                })
            }
        ]
    },
    {
        id: 'events',
        title: 'Events',
        summary: 'Calendar events, participation, invitations, rides, payments and the event audit log.',
        icon: 'pi pi-calendar',
        endpoints: [
            {
                id: 'list-events',
                method: 'GET',
                path: '/events',
                title: 'List events in a calendar range',
                description:
                    'Returns the events visible to the caller whose start time falls inside the requested range.',
                auth: 'authenticated',
                scope: 'read',
                params: [
                    {
                        name: 'start',
                        in: 'query',
                        type: 'ISO 8601 date',
                        required: true,
                        description: 'Start of the range, inclusive.'
                    },
                    {
                        name: 'end',
                        in: 'query',
                        type: 'ISO 8601 date',
                        required: true,
                        description: 'End of the range, inclusive.'
                    }
                ],
                response: json([
                    {
                        id: 12,
                        title: 'Weekend trip',
                        startTime: '2026-10-24T09:00:00.000Z',
                        endTime: '2026-10-25T18:00:00.000Z',
                        hostId: 1,
                        host: { id: 1, username: 'alice', isAdmin: false },
                        participants: [{ id: 2, username: 'bob', status: 'ACCEPTED' }],
                        isOpen: true,
                        isPrivate: false
                    }
                ])
            },
            {
                id: 'upcoming-events',
                method: 'GET',
                path: '/events/upcoming',
                title: 'List upcoming events',
                description: 'Returns the near-future events the caller can see, ordered for the upcoming view.',
                auth: 'authenticated',
                scope: 'read'
            },
            {
                id: 'get-event',
                method: 'GET',
                path: '/events/{id}',
                title: 'Get an event',
                description:
                    'Returns a single event with host, co-hosts, participants, ride assignments and cost fields.',
                auth: 'authenticated',
                scope: 'read',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }]
            },
            {
                id: 'create-event',
                method: 'POST',
                path: '/events',
                title: 'Create an event',
                description:
                    'Creates an event hosted by the calling account. The start time must be today or within one year.',
                auth: 'authenticated',
                scope: 'write',
                body: json({
                    title: 'Weekend trip',
                    description: 'Two days by the lake',
                    location: 'Lake Como',
                    startTime: '2026-10-24T09:00:00.000Z',
                    endTime: '2026-10-25T18:00:00.000Z',
                    participants: [2, 3],
                    coHosts: [2],
                    participationDeadline: '2026-10-22T18:00:00.000Z',
                    isOpen: true,
                    isPrivate: false,
                    hasFood: true,
                    foodPrice: 25,
                    hasSleep: true,
                    sleepPrice: 40
                }),
                params: [
                    { name: 'title', in: 'body', type: 'string', required: true, description: 'Event title.' },
                    {
                        name: 'startTime',
                        in: 'body',
                        type: 'ISO 8601 date',
                        required: true,
                        description: 'Today or within one year.'
                    },
                    { name: 'endTime', in: 'body', type: 'ISO 8601 date', description: 'Optional end time.' },
                    { name: 'participants', in: 'body', type: 'integer[]', description: 'User ids to invite.' },
                    {
                        name: 'coHosts',
                        in: 'body',
                        type: 'integer[]',
                        description: 'Users that can edit the event like the host.'
                    },
                    {
                        name: 'isOpen',
                        in: 'body',
                        type: 'boolean',
                        description: 'Whether anybody may join without an invite.'
                    },
                    { name: 'isPrivate', in: 'body', type: 'boolean', description: 'Hide the event from non-invitees.' }
                ]
            },
            {
                id: 'update-event',
                method: 'PATCH',
                path: '/events/{id}',
                title: 'Update an event',
                description: 'Host and co-hosts can change any event field. Changes are recorded in the audit log.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }],
                body: json({ title: 'Weekend trip (updated)', location: 'Lake Garda' })
            },
            {
                id: 'delete-event',
                method: 'DELETE',
                path: '/events/{id}',
                title: 'Delete an event',
                description:
                    'Only the host can delete an event. Participants, chat and audit entries are removed with it.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }]
            },
            {
                id: 'invite-user',
                method: 'POST',
                path: '/events/{id}/invite',
                title: 'Invite a registered user',
                description: 'Invites an existing account by username. Host and co-hosts only.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }],
                body: json({ username: 'bob' })
            },
            {
                id: 'join-event',
                method: 'POST',
                path: '/events/{id}/join',
                title: 'Join an event',
                description:
                    'Accepts an invitation or joins an open event, with food, drink and transport preferences.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }],
                body: json({
                    wantsFood: true,
                    wantsSleep: true,
                    wantsAlcohol: false,
                    wantsBeer: false,
                    wantsWeed: false,
                    transportMode: 'NEEDS_RIDE'
                })
            },
            {
                id: 'update-participation',
                method: 'PATCH',
                path: '/events/{id}/join',
                title: 'Edit your participation',
                description: 'Updates the caller preferences or driver seat counts for an event they already joined.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }],
                body: json({
                    wantsFood: true,
                    transportMode: 'DRIVER',
                    vehicleSeatsOutbound: 3,
                    vehicleSeatsReturn: 3
                })
            },
            {
                id: 'leave-event',
                method: 'DELETE',
                path: '/events/{id}/join',
                title: 'Leave an event',
                description: 'Cancels the caller participation. Hosts must transfer or delete the event first.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }]
            },
            {
                id: 'assign-ride',
                method: 'POST',
                path: '/events/{id}/assign-ride',
                title: 'Assign one passenger to a driver',
                description:
                    'Host/co-host assigns a passenger to a driver for the outbound or return leg. Use a null driverId to unassign.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }],
                body: json({ passengerId: 2, driverId: 3, direction: 'OUTBOUND' }),
                notes: ['Guest participants use negative ids: -(guestParticipantId).']
            },
            {
                id: 'assign-rides-batch',
                method: 'PATCH',
                path: '/events/{id}/rides',
                title: 'Assign several passengers at once',
                description: 'Batch version of ride assignment for one direction.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }],
                body: json({ passengerIds: [2, 4, 5], driverId: 3, direction: 'RETURN' })
            },
            {
                id: 'update-payment-status',
                method: 'PATCH',
                path: '/events/{id}/participants/{userId}/payment',
                title: 'Mark a participant as paid',
                description: 'Host/co-host tracks whether a participant settled their share.',
                auth: 'authenticated',
                scope: 'write',
                params: [
                    { name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' },
                    { name: 'userId', in: 'path', type: 'integer', required: true, description: 'Participant user id.' }
                ],
                body: json({ hasPaid: true })
            },
            {
                id: 'event-audit-log',
                method: 'GET',
                path: '/events/{id}/audit-log',
                title: 'Read the event audit log',
                description: 'Returns the change history for hosts, co-hosts and participants.',
                auth: 'authenticated',
                scope: 'read',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }],
                response: json([
                    {
                        id: 44,
                        eventId: 12,
                        actorId: 1,
                        actorUsername: 'alice',
                        impersonatorId: null,
                        actionType: 'EVENT_UPDATED',
                        payloadDiff: { before: { title: 'Trip' }, after: { title: 'Weekend trip' } },
                        resolvedUsers: {},
                        createdAt: '2026-10-20T12:00:00.000Z'
                    }
                ])
            },
            {
                id: 'create-guest-invite',
                method: 'POST',
                path: '/events/{id}/guest-invites',
                title: 'Create a magic-link guest invite',
                description:
                    'Creates a guest participant and a single-use link for somebody without an account. Host only.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Event id.' }],
                response: json({
                    url: 'https://calendar.legacy-group.tech/invite/5f0c…',
                    guestUserId: -8,
                    expiresAt: '2026-10-27T12:00:00.000Z'
                }),
                notes: ['Limited to 20 requests per minute.']
            }
        ]
    },
    {
        id: 'guest-invites',
        title: 'Guest magic links',
        summary:
            'Endpoints used by the public invite page. The secret lives in the path, so no session or API token is involved.',
        icon: 'pi pi-envelope',
        endpoints: [
            {
                id: 'get-guest-invite',
                method: 'GET',
                path: '/guest-invites/{token}',
                title: 'Read a guest invite',
                description: 'Returns the event summary and the current guest participation.',
                auth: 'guest',
                params: [
                    {
                        name: 'token',
                        in: 'path',
                        type: 'string',
                        required: true,
                        description: 'Secret from the invite link.'
                    }
                ]
            },
            {
                id: 'update-guest-invite',
                method: 'PATCH',
                path: '/guest-invites/{token}',
                title: 'Update guest participation',
                description:
                    'Sets the guest display name on first use and updates food, drink and transport preferences.',
                auth: 'guest',
                params: [
                    {
                        name: 'token',
                        in: 'path',
                        type: 'string',
                        required: true,
                        description: 'Secret from the invite link.'
                    }
                ],
                body: json({ username: 'jane_doe', wantsFood: true, transportMode: 'SELF' }),
                notes: ['Rejected after the participation deadline or once the event has ended.']
            },
            {
                id: 'leave-guest-invite',
                method: 'DELETE',
                path: '/guest-invites/{token}',
                title: 'Leave as a guest',
                description: 'Declines the invitation for this guest.',
                auth: 'guest',
                params: [
                    {
                        name: 'token',
                        in: 'path',
                        type: 'string',
                        required: true,
                        description: 'Secret from the invite link.'
                    }
                ]
            }
        ]
    },
    {
        id: 'chat',
        title: 'Chat',
        summary: 'Event chat history, pinned messages, media uploads and the real-time Socket.IO protocol.',
        icon: 'pi pi-comments',
        endpoints: [
            {
                id: 'chat-history',
                method: 'GET',
                path: '/chat/{eventId}/messages',
                title: 'Get chat history',
                description: 'Returns a page of messages for an event the caller participates in.',
                auth: 'authenticated',
                scope: 'read',
                params: [
                    { name: 'eventId', in: 'path', type: 'integer', required: true, description: 'Event id.' },
                    { name: 'cursor', in: 'query', type: 'integer', description: 'Message id to page from.' },
                    { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1-100. Defaults to 50.' }
                ],
                response: json({
                    messages: [
                        {
                            id: 91,
                            eventId: 12,
                            authorId: 1,
                            authorUsername: 'alice',
                            text: 'See you at 9!',
                            mediaUrl: null,
                            mediaType: null,
                            reactions: [],
                            isPinned: false,
                            createdAt: '2026-10-20T12:00:00.000Z',
                            isEdited: false,
                            updatedAt: '2026-10-20T12:00:00.000Z'
                        }
                    ],
                    nextCursor: null
                })
            },
            {
                id: 'chat-pinned',
                method: 'GET',
                path: '/chat/{eventId}/pinned',
                title: 'Get pinned messages',
                description: 'Returns the pinned messages for an event the caller participates in.',
                auth: 'authenticated',
                scope: 'read',
                params: [{ name: 'eventId', in: 'path', type: 'integer', required: true, description: 'Event id.' }]
            },
            {
                id: 'chat-upload',
                method: 'POST',
                path: '/chat/{eventId}/upload',
                title: 'Upload chat media',
                description:
                    'Uploads an image, GIF, video or audio file for an event the caller participates in. Images are re-encoded to WebP and videos to MP4.',
                auth: 'authenticated',
                scope: 'write',
                params: [
                    { name: 'eventId', in: 'path', type: 'integer', required: true, description: 'Event id.' },
                    {
                        name: 'file',
                        in: 'body',
                        type: 'multipart/form-data',
                        required: true,
                        description: 'Media file, up to 25 MB.'
                    }
                ],
                response: json({ mediaUrl: 'uploads/chat/12/6f7e….webp', mediaType: 'image' })
            },
            {
                id: 'ws-connect',
                method: 'WS',
                path: 'connection',
                title: 'Connect to the chat socket',
                description:
                    'Authenticate the Socket.IO handshake with either a session token or an API token. API tokens can be sent as auth.apiToken or as the X-API-Token header.',
                auth: 'authenticated',
                scope: 'read',
                response: json({
                    auth: {
                        token: '<session jwt>',
                        apiToken: API_TOKEN_EXAMPLE
                    }
                })
            },
            {
                id: 'ws-join-room',
                method: 'WS',
                path: 'joinRoom',
                title: 'Join an event room',
                description: 'Joins chat:{eventId}. The server verifies that the caller participates in the event.',
                auth: 'authenticated',
                scope: 'read',
                body: json({ eventId: 12 })
            },
            {
                id: 'ws-leave-room',
                method: 'WS',
                path: 'leaveRoom',
                title: 'Leave an event room',
                description: 'Leaves the chat room for an event.',
                auth: 'authenticated',
                scope: 'read',
                body: json({ eventId: 12 })
            },
            {
                id: 'ws-send-message',
                method: 'WS',
                path: 'sendMessage',
                title: 'Send a message',
                description: 'Broadcasts newMessage to everybody in the event room. Requires a write-capable token.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ eventId: 12, text: 'See you at 9!', mediaUrl: null, mediaType: null })
            },
            {
                id: 'ws-edit-message',
                method: 'WS',
                path: 'editMessage',
                title: 'Edit a message',
                description: 'Authors can edit their own text messages. Broadcasts messageEdited.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ messageId: 91, text: 'See you at 9:30!' })
            },
            {
                id: 'ws-delete-message',
                method: 'WS',
                path: 'deleteMessage',
                title: 'Delete a message',
                description: 'Authors, hosts, co-hosts and admins can delete a message. Broadcasts messageDeleted.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ messageId: 91 })
            },
            {
                id: 'ws-reaction',
                method: 'WS',
                path: 'addReaction',
                title: 'Toggle a reaction',
                description: 'Adds or removes the caller reaction and broadcasts reactionUpdated.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ messageId: 91, emoji: '🎉' })
            },
            {
                id: 'ws-pin',
                method: 'WS',
                path: 'pinMessage',
                title: 'Pin a message',
                description: 'Host, co-host or admin only. Broadcasts messagePinned.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ messageId: 91 })
            },
            {
                id: 'ws-unpin',
                method: 'WS',
                path: 'unpinMessage',
                title: 'Unpin a message',
                description: 'Host, co-host or admin only. Broadcasts messageUnpinned.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ messageId: 91 })
            },
            {
                id: 'ws-typing',
                method: 'WS',
                path: 'typing / stopTyping',
                title: 'Typing indicators',
                description: 'Broadcasts userTyping and userStoppedTyping to the rest of the event room.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ eventId: 12 })
            }
        ]
    },
    {
        id: 'notifications',
        title: 'Notifications',
        summary: 'Firebase Cloud Messaging subscriptions and per-event chat mute preferences.',
        icon: 'pi pi-bell',
        endpoints: [
            {
                id: 'subscribe-notifications',
                method: 'POST',
                path: '/notifications/subscribe',
                title: 'Subscribe a device',
                description:
                    'Registers a Firebase Cloud Messaging token for the current account. Subscribing the same token again moves it to this account.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ token: 'fcm-registration-token' }),
                notes: ['Limited to 30 requests per minute.']
            },
            {
                id: 'unsubscribe-notifications',
                method: 'POST',
                path: '/notifications/unsubscribe',
                title: 'Unsubscribe a device',
                description: 'Removes a Firebase token from the current account.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ token: 'fcm-registration-token' })
            },
            {
                id: 'list-muted-events',
                method: 'GET',
                path: '/notifications/mute',
                title: 'List muted event chats',
                description: 'Returns the ids of events whose chat notifications are muted.',
                auth: 'authenticated',
                scope: 'read',
                response: json([12, 19])
            },
            {
                id: 'mute-event',
                method: 'POST',
                path: '/notifications/mute/{eventId}',
                title: 'Mute an event chat',
                description:
                    'Stops chat push notifications for an event the caller participates in. Returns 201 when created, 200 when it already existed.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'eventId', in: 'path', type: 'integer', required: true, description: 'Event id.' }]
            },
            {
                id: 'unmute-event',
                method: 'DELETE',
                path: '/notifications/mute/{eventId}',
                title: 'Unmute an event chat',
                description: 'Removes the mute preference. Returns 404 when no mute existed.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'eventId', in: 'path', type: 'integer', required: true, description: 'Event id.' }]
            }
        ]
    },
    {
        id: 'user-groups',
        title: 'User groups',
        summary: 'Saved invite lists owned by the current account, used to add several people to an event in one tap.',
        icon: 'pi pi-users',
        endpoints: [
            {
                id: 'list-user-groups',
                method: 'GET',
                path: '/user-groups',
                title: 'List user groups',
                description: 'Returns every saved invite group of the current account.',
                auth: 'authenticated',
                scope: 'read',
                response: json([
                    {
                        id: 3,
                        name: 'Weekend crew',
                        memberIds: [2, 4, 5],
                        createdAt: '2026-10-20T12:00:00.000Z',
                        updatedAt: '2026-10-20T12:00:00.000Z'
                    }
                ])
            },
            {
                id: 'get-user-group',
                method: 'GET',
                path: '/user-groups/{id}',
                title: 'Get a user group',
                description: 'Returns one group owned by the current account.',
                auth: 'authenticated',
                scope: 'read',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Group id.' }]
            },
            {
                id: 'create-user-group',
                method: 'POST',
                path: '/user-groups',
                title: 'Create a user group',
                description: 'Creates a named list of member user ids for the current account.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ name: 'Weekend crew', memberIds: [2, 4, 5] })
            },
            {
                id: 'update-user-group',
                method: 'PATCH',
                path: '/user-groups/{id}',
                title: 'Update a user group',
                description: 'Renames a group or replaces its member list.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Group id.' }],
                body: json({ name: 'Lake crew', memberIds: [2, 3, 4] })
            },
            {
                id: 'delete-user-group',
                method: 'DELETE',
                path: '/user-groups/{id}',
                title: 'Delete a user group',
                description: 'Deletes the group. Existing event invitations are unaffected.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Group id.' }]
            }
        ]
    },
    {
        id: 'users',
        title: 'Users & payments',
        summary: 'Directory lookups plus admin-only account management and the caller payment coordinates.',
        icon: 'pi pi-id-card',
        endpoints: [
            {
                id: 'list-users',
                method: 'GET',
                path: '/users',
                title: 'List users',
                description: 'Returns all accounts. Payment fields are omitted for other users.',
                auth: 'authenticated',
                scope: 'read'
            },
            {
                id: 'get-user',
                method: 'GET',
                path: '/users/{id}',
                title: 'Get a user',
                description: 'Returns one account. Owners and admins also receive the private payment coordinates.',
                auth: 'authenticated',
                scope: 'read',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'User id.' }]
            },
            {
                id: 'update-payment-info',
                method: 'PATCH',
                path: '/users/me/payment-info',
                title: 'Update payment coordinates',
                description:
                    'Sets or clears the caller PayPal, Revolut and IBAN details. An empty string clears a field.',
                auth: 'authenticated',
                scope: 'write',
                body: json({
                    paypalLink: 'https://paypal.me/alice',
                    revolutLink: 'https://revolut.me/alice',
                    ibanNumber: 'IT60X0542811101000000123456',
                    ibanAccountHolder: 'Alice Doe'
                })
            },
            {
                id: 'admin-create-user',
                method: 'POST',
                path: '/users',
                title: 'Create a local user (admin)',
                description: 'Creates an app-local account record. Admin only.',
                auth: 'authenticated',
                scope: 'write',
                body: json({ username: 'newuser', isAdmin: false }),
                notes: ['API tokens inherit the account role, so an admin write token can use admin endpoints.']
            },
            {
                id: 'admin-update-user',
                method: 'PATCH',
                path: '/users/{id}',
                title: 'Update a user (admin)',
                description: 'Changes the username or admin flag of an account. Admin only.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'User id.' }],
                body: json({ username: 'renamed', isAdmin: true })
            },
            {
                id: 'admin-delete-user',
                method: 'DELETE',
                path: '/users/{id}',
                title: 'Delete a user (admin)',
                description: 'Deletes an account and everything owned by it. Admin only.',
                auth: 'authenticated',
                scope: 'write',
                params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'User id.' }]
            }
        ]
    },
    {
        id: 'files',
        title: 'Uploads & system',
        summary: 'Public file serving and the health endpoint.',
        icon: 'pi pi-database',
        endpoints: [
            {
                id: 'get-upload',
                method: 'GET',
                path: '/uploads/{path}',
                title: 'Serve an uploaded file',
                description:
                    'Serves profile pictures and chat media from disk. When the file is missing locally and REMOTE_UPLOADS_URL is configured, the request redirects to the remote origin.',
                auth: 'public',
                params: [
                    {
                        name: 'path',
                        in: 'path',
                        type: 'string',
                        required: true,
                        description: 'Path below the uploads directory.'
                    }
                ]
            },
            {
                id: 'health',
                method: 'GET',
                path: '/',
                title: 'Health check',
                description: 'Returns the service greeting. Useful as a lightweight availability probe.',
                auth: 'public',
                response: 'Legacy Calendar API'
            }
        ]
    }
];

export const API_DOC_ENDPOINT_COUNT = API_DOC_GROUPS.reduce((total, group) => total + group.endpoints.length, 0);
