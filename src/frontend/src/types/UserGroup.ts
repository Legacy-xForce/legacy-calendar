export interface UserGroup {
    id: number;
    userId: number;
    name: string;
    memberIds: number[];
    createdAt: string;
    updatedAt: string;
}

export interface CreateUserGroupDto {
    name: string;
    memberIds: number[];
}

export interface UpdateUserGroupDto {
    name?: string;
    memberIds?: number[];
}
