export const CHAT_MEDIA_TYPES = ['image', 'gif', 'video', 'audio'] as const;
export type ChatMediaType = (typeof CHAT_MEDIA_TYPES)[number];

export interface ChatReactionSummary {
    emoji: string;
    count: number;
    userIds: number[];
}

export interface ChatMessage {
    id: number;
    eventId: number;
    authorId: number;
    authorUsername: string;
    authorProfilePictureUrl?: string | null;
    text: string | null;
    mediaUrl: string | null;
    mediaType: ChatMediaType | null;
    reactions: ChatReactionSummary[];
    isPinned: boolean;
    createdAt: string | Date;
    isEdited?: boolean;
    updatedAt?: string | Date;
}

export interface ChatEditedMessage extends ChatMessage {
    isEdited: boolean;
    updatedAt: string | Date;
}

export interface ChatHistoryResponse {
    messages: ChatMessage[];
    nextCursor: number | null;
}

export interface ChatMediaUploadResponse {
    mediaUrl: string;
    mediaType: ChatMediaType;
}

export interface ChatReactionUpdatedPayload {
    messageId: number;
    reactions: ChatReactionSummary[];
}

export type ChatMessageEventPayload = ChatMessage | ChatEditedMessage;
