import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { createLogger } from './logger';

export const baseURL = import.meta.env.VITE_API_URL;
export const uploadsBaseURL = import.meta.env.VITE_UPLOADS_URL || baseURL;
export const socketBaseURL = import.meta.env.VITE_WS_URL || baseURL;
export const socketPath = '/socket.io';
export const authBaseURL = import.meta.env.VITE_AUTH_URL || 'https://auth.legacy-group.tech';

import type { CreateUserDto, PaymentInfo, UpdatePaymentInfoDto, UpdateUserDto, User } from '../types/User';
import type { CalendarVisibleRange } from '../types/Calendar';
import type { CreateEventDto, Event, ParticipateDto } from '../types/Event';
import type { ChatHistoryResponse, ChatMediaUploadResponse } from '../types/Chat';
import type { AuditLogEntry } from '../types/AuditLog';
import type { CreateGuestInviteResponse, GuestInviteResponse, GuestParticipateDto } from '../types/GuestInvite';
import type { UserGroup, CreateUserGroupDto, UpdateUserGroupDto } from '../types/UserGroup';
import type { ApiToken, CreateApiTokenDto, CreatedApiToken } from '../types/ApiToken';

declare module 'axios' {
    interface AxiosRequestConfig {
        /** Let the caller handle a 401 instead of sending the browser to sign in. */
        skipAuthRedirect?: boolean;
    }
}

// --- API Class ---

const logger = createLogger('API');

class API {
    private client: AxiosInstance;

    constructor() {
        // The browser session is an HttpOnly cookie set by the backend; requests carry it, never a token.
        this.client = axios.create({
            baseURL: baseURL,
            withCredentials: true,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.client.interceptors.request.use(
            (config) => {
                const impersonateUserId = localStorage.getItem('impersonate_user_id');
                if (impersonateUserId) {
                    if (!config.headers) {
                        config.headers = {} as any;
                    }
                    config.headers['X-Impersonate'] = impersonateUserId;
                }

                logger.debug('Sending request', {
                    method: config.method?.toUpperCase() ?? 'GET',
                    url: config.baseURL ? `${config.baseURL}${config.url ?? ''}` : config.url,
                    impersonating: Boolean(impersonateUserId)
                });

                return config;
            },
            (error) => {
                logger.error('Failed to prepare request', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            (response) => {
                logger.info('Received response', {
                    method: response.config.method?.toUpperCase() ?? 'GET',
                    url: response.config.url,
                    status: response.status
                });
                return response;
            },
            async (error) => {
                logger.warn('Request failed', {
                    method: error?.config?.method?.toUpperCase() ?? 'UNKNOWN',
                    url: error?.config?.url,
                    status: error?.response?.status,
                    message: error?.response?.data?.message ?? error.message
                });

                if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
                    // The session ended (signed out elsewhere, expired, or access removed): sign in again.
                    const { redirectToLogin } = await import('./auth');
                    redirectToLogin();
                }
                return Promise.reject(error);
            }
        );
    }

    // --- Auth ---

    async getProfile(options: { skipAuthRedirect?: boolean } = {}): Promise<AxiosResponse<User>> {
        // Note: Spec defines this as POST /auth/profile
        return this.client.post('/auth/profile', undefined, options);
    }

    /** Ends the session here; the response says where to send the browser to sign out of Legacy Auth too. */
    async logout(): Promise<AxiosResponse<{ redirect: string }>> {
        return this.client.post('/auth/logout', undefined, { skipAuthRedirect: true });
    }

    // --- Users ---

    async findAllUsers(): Promise<AxiosResponse<User[]>> {
        return this.client.get('/users');
    }

    async findOneUser(id: number): Promise<AxiosResponse<User>> {
        return this.client.get(`/users/${id}`);
    }

    async createUser(dto: CreateUserDto): Promise<AxiosResponse<User>> {
        return this.client.post('/users', dto);
    }

    async updateUser(id: number, dto: UpdateUserDto): Promise<AxiosResponse<User>> {
        return this.client.patch(`/users/${id}`, dto);
    }

    async updateMyPaymentInfo(dto: UpdatePaymentInfoDto): Promise<AxiosResponse<PaymentInfo>> {
        return this.client.patch('/users/me/payment-info', dto);
    }

    async removeUser(id: number): Promise<AxiosResponse<void>> {
        return this.client.delete(`/users/${id}`);
    }

    // --- Events ---

    async findCalendarEvents(range: Pick<CalendarVisibleRange, 'start' | 'end'>): Promise<AxiosResponse<Event[]>> {
        return this.client.get('/events', {
            params: {
                start: range.start.toISOString(),
                end: range.end.toISOString()
            }
        });
    }

    async findUpcomingEvents(): Promise<AxiosResponse<Event[]>> {
        return this.client.get('/events/upcoming');
    }

    async findOneEvent(id: number): Promise<AxiosResponse<Event>> {
        return this.client.get(`/events/${id}`);
    }

    async createEvent(dto: CreateEventDto): Promise<AxiosResponse<Event>> {
        return this.client.post('/events', dto);
    }

    async deleteEvent(id: number): Promise<AxiosResponse<void>> {
        return this.client.delete(`/events/${id}`);
    }

    async updateEvent(id: number, dto: Partial<CreateEventDto>): Promise<AxiosResponse<Event>> {
        return this.client.patch(`/events/${id}`, dto);
    }

    async joinEvent(id: number, dto?: ParticipateDto): Promise<AxiosResponse<void>> {
        return this.client.post(`/events/${id}/join`, dto || {});
    }

    async leaveEvent(id: number): Promise<AxiosResponse<void>> {
        return this.client.delete(`/events/${id}/join`);
    }

    // --- Notifications ---

    async subscribeNotifications(token: string): Promise<AxiosResponse<void>> {
        return this.client.post('/notifications/subscribe', { token });
    }

    async unsubscribeNotifications(token: string): Promise<AxiosResponse<void>> {
        return this.client.post('/notifications/unsubscribe', { token });
    }

    async getMutedChatEvents(): Promise<AxiosResponse<number[]>> {
        return this.client.get('/notifications/mute');
    }

    async muteChatNotifications(eventId: number): Promise<AxiosResponse<void>> {
        return this.client.post(`/notifications/mute/${eventId}`);
    }

    async unmuteChatNotifications(eventId: number): Promise<AxiosResponse<void>> {
        return this.client.delete(`/notifications/mute/${eventId}`);
    }

    async assignRide(
        eventId: number,
        passengerId: number,
        driverId: number | null,
        direction: 'OUTBOUND' | 'RETURN' = 'OUTBOUND'
    ): Promise<AxiosResponse<Event>> {
        return this.client.post(`/events/${eventId}/assign-ride`, { passengerId, driverId, direction });
    }

    async assignRides(
        eventId: number,
        passengerIds: number[],
        driverId: number | null,
        direction: 'OUTBOUND' | 'RETURN' = 'OUTBOUND'
    ): Promise<AxiosResponse<Event>> {
        return this.client.patch(`/events/${eventId}/rides`, { passengerIds, driverId, direction });
    }

    async getEventAuditLog(eventId: number): Promise<AxiosResponse<AuditLogEntry[]>> {
        return this.client.get(`/events/${eventId}/audit-log`, {
            timeout: 30000
        });
    }

    // --- Guest Invites ---

    async createGuestInvite(eventId: number): Promise<AxiosResponse<CreateGuestInviteResponse>> {
        return this.client.post(`/events/${eventId}/guest-invites`);
    }

    async getGuestInvite(token: string): Promise<AxiosResponse<GuestInviteResponse>> {
        return this.client.get(`/guest-invites/${token}`);
    }

    async updateGuestInvite(token: string, dto: GuestParticipateDto): Promise<AxiosResponse<GuestInviteResponse>> {
        return this.client.patch(`/guest-invites/${token}`, dto);
    }

    async leaveGuestInvite(token: string): Promise<AxiosResponse<GuestInviteResponse>> {
        return this.client.delete(`/guest-invites/${token}`);
    }

    // --- Chat ---

    async getChatHistory(eventId: number, cursor?: number, limit = 50): Promise<AxiosResponse<ChatHistoryResponse>> {
        return this.client.get(`/chat/${eventId}/messages`, {
            params: {
                cursor,
                limit
            }
        });
    }

    async getPinnedChatMessages(eventId: number): Promise<AxiosResponse<ChatHistoryResponse['messages']>> {
        return this.client.get(`/chat/${eventId}/pinned`);
    }

    async uploadChatMedia(eventId: number, file: File): Promise<AxiosResponse<ChatMediaUploadResponse>> {
        const formData = new FormData();
        formData.append('file', file);

        return this.client.post(`/chat/${eventId}/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
    }

    // --- Payment ---

    async updateParticipantPayment(
        eventId: number,
        userId: number,
        hasPaid: boolean
    ): Promise<AxiosResponse<{ success: boolean; hasPaid: boolean }>> {
        return this.client.patch(`/events/${eventId}/participants/${userId}/payment`, { hasPaid });
    }

    // --- User Groups ---

    async getUserGroups(): Promise<AxiosResponse<UserGroup[]>> {
        return this.client.get('/user-groups');
    }

    async createUserGroup(dto: CreateUserGroupDto): Promise<AxiosResponse<UserGroup>> {
        return this.client.post('/user-groups', dto);
    }

    async updateUserGroup(id: number, dto: UpdateUserGroupDto): Promise<AxiosResponse<UserGroup>> {
        return this.client.patch(`/user-groups/${id}`, dto);
    }

    async deleteUserGroup(id: number): Promise<AxiosResponse<void>> {
        return this.client.delete(`/user-groups/${id}`);
    }

    // --- API tokens ---

    async getApiTokens(): Promise<AxiosResponse<ApiToken[]>> {
        return this.client.get('/api-tokens');
    }

    async createApiToken(dto: CreateApiTokenDto): Promise<AxiosResponse<CreatedApiToken>> {
        return this.client.post('/api-tokens', dto);
    }

    async rotateApiToken(id: number): Promise<AxiosResponse<CreatedApiToken>> {
        return this.client.post(`/api-tokens/${id}/rotate`);
    }

    async deleteApiToken(id: number): Promise<AxiosResponse<{ success: boolean }>> {
        return this.client.delete(`/api-tokens/${id}`);
    }
}

export default new API();
