import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { createLogger } from './logger';

export const baseURL = import.meta.env.VITE_API_URL;
export const uploadsBaseURL = import.meta.env.VITE_UPLOADS_URL || baseURL;
export const socketBaseURL = import.meta.env.VITE_WS_URL || baseURL;
export const socketPath = '/socket.io';
export const authBaseURL = import.meta.env.VITE_AUTH_URL || 'https://auth.legacy-group.tech';

import type { CreateUserDto, UpdateUserDto, User } from '../types/User';
import type { AuthLoginDto, ChangePasswordDto } from '../types/Auth';
import type { CalendarVisibleRange } from '../types/Calendar';
import type { CreateEventDto, Event, ParticipateDto } from '../types/Event';
import type { ChatHistoryResponse, ChatMediaUploadResponse } from '../types/Chat';
import type { AuditLogEntry } from '../types/AuditLog';

// --- API Class ---

const logger = createLogger('API');

class API {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: baseURL,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.client.interceptors.request.use(
            (config) => {
                const token = localStorage.getItem('token');
                if (token && config.headers) {
                    config.headers.Authorization = `Bearer ${token}`;
                }

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
                    hasToken: Boolean(token),
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
            (error) => {
                logger.warn('Request failed', {
                    method: error?.config?.method?.toUpperCase() ?? 'UNKNOWN',
                    url: error?.config?.url,
                    status: error?.response?.status,
                    message: error?.response?.data?.message ?? error.message
                });

                if (error.response && error.response.status === 401) {
                    // Session is invalid or expired
                    localStorage.removeItem('token');
                    localStorage.setItem('session_expired', 'true');

                    // Force redirect to login if not already there
                    if (!window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
                        window.location.href = '/';
                    }
                }
                return Promise.reject(error);
            }
        );
    }

    // --- Auth ---

    async login(dto: AuthLoginDto): Promise<AxiosResponse<{ access_token: string }>> {
        // Authenticate against the external auth microservice and return its token
        return axios.post(`${authBaseURL}/auth/login`, dto);
    }

    async getProfile(): Promise<AxiosResponse<User>> {
        // Note: Spec defines this as POST /auth/profile
        return this.client.post('/auth/profile');
    }

    async changePassword(dto: ChangePasswordDto): Promise<AxiosResponse<void>> {
        return this.client.post('/auth/change-password', dto);
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

    async updateEvent(id: number, dto: Partial<CreateEventDto>): Promise<AxiosResponse<void>> {
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

    // --- Profile Picture ---

    async uploadProfilePicture(file: File, userId?: number): Promise<AxiosResponse<User>> {
        const formData = new FormData();
        formData.append('file', file);
        if (userId) {
            formData.append('userId', userId.toString());
        }
        return this.client.post('/users/profile-picture', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
    }

    async removeProfilePicture(userId?: number): Promise<AxiosResponse<void>> {
        return this.client.delete('/users/profile-picture', {
            data: { userId }
        });
    }

    async assignRide(eventId: number, passengerId: number, driverId: number | null): Promise<AxiosResponse<void>> {
        return this.client.post(`/events/${eventId}/assign-ride`, { passengerId, driverId });
    }

    async getEventAuditLog(eventId: number): Promise<AxiosResponse<AuditLogEntry[]>> {
        return this.client.get(`/events/${eventId}/audit-log`, {
            timeout: 30000
        });
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
}

export default new API();
