import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
    Request,
    ParseIntPipe,
    Inject
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserGroupsService } from './user-groups.service.js';
import { CreateUserGroupDto } from './dto/create-user-group.dto.js';
import { UpdateUserGroupDto } from './dto/update-user-group.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { type RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';

@ApiTags('user-groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-groups')
export class UserGroupsController {
    constructor(@Inject(UserGroupsService) private readonly userGroupsService: UserGroupsService) {}

    @Get()
    @ApiOperation({ summary: 'Get all custom user groups for current user' })
    @ApiResponse({ status: 200, description: 'Return user groups' })
    findAll(@Request() req: RequestWithUser) {
        return this.userGroupsService.findAll(req.user.userId as number);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a user group by ID' })
    @ApiResponse({ status: 200, description: 'Return user group' })
    @ApiResponse({ status: 404, description: 'User group not found' })
    findOne(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
        return this.userGroupsService.findOne(id, req.user.userId as number);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new custom user group' })
    @ApiResponse({ status: 201, description: 'User group created successfully' })
    create(@Body() dto: CreateUserGroupDto, @Request() req: RequestWithUser) {
        return this.userGroupsService.create(req.user.userId as number, dto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a user group' })
    @ApiResponse({ status: 200, description: 'User group updated successfully' })
    @ApiResponse({ status: 404, description: 'User group not found' })
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserGroupDto, @Request() req: RequestWithUser) {
        return this.userGroupsService.update(id, req.user.userId as number, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a user group' })
    @ApiResponse({ status: 200, description: 'User group deleted successfully' })
    @ApiResponse({ status: 404, description: 'User group not found' })
    remove(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
        return this.userGroupsService.remove(id, req.user.userId as number);
    }
}
