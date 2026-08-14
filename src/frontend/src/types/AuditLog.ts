export const AUDIT_LOG_ACTIONS = [
    'EVENT_CREATED',
    'EVENT_UPDATED',
    'EVENT_DELETED',
    'PARTICIPANT_JOINED',
    'PARTICIPANT_DECLINED',
    'PARTICIPANT_REMOVED',
    'PARTICIPANT_UPDATED',
    'PARTICIPANT_INVITED',
    'RIDE_ASSIGNED',
    'RIDE_UNASSIGNED'
] as const;

export type AuditLogActionType = (typeof AUDIT_LOG_ACTIONS)[number];

export type AuditLogPayloadDiff = {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
};

export interface AuditLogUserRef {
    id: number;
    username: string;
    profilePictureUrl: string | null;
}

export interface AuditLogEntry {
    id: number;
    eventId: number;
    actorId: number;
    actorUsername: string;
    actorProfilePictureUrl: string | null;
    impersonatorId: number | null;
    impersonatorUsername: string | null;
    impersonatorProfilePictureUrl: string | null;
    actionType: AuditLogActionType;
    payloadDiff: AuditLogPayloadDiff;
    resolvedUsers: Record<number, AuditLogUserRef>;
    createdAt: string;
}
