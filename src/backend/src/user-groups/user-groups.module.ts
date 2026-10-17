import { Module } from '@nestjs/common';
import { UserGroupsController } from './user-groups.controller.js';
import { UserGroupsService } from './user-groups.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
    imports: [PrismaModule],
    controllers: [UserGroupsController],
    providers: [UserGroupsService],
    exports: [UserGroupsService]
})
export class UserGroupsModule {}
