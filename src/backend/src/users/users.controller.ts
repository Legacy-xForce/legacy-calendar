import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Request,
    UseGuards,
    Inject
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { UserAuthGuard } from '../auth/guards/user-auth.guard.js';
import { type RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdatePaymentInfoDto } from './dto/update-payment-info.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

    @Post()
    @UseGuards(UserAuthGuard, AdminGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new user (Admin only)' })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    @ApiResponse({ status: 409, description: 'Username already taken' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
    create(@Body() createUserDto: CreateUserDto) {
        return this.usersService.create(createUserDto);
    }

    @Get()
    @UseGuards(UserAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all users' })
    @ApiResponse({ status: 200, description: 'Return all users' })
    findAll() {
        return this.usersService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a user by ID' })
    @ApiResponse({ status: 200, description: 'Return user' })
    @ApiResponse({ status: 404, description: 'User not found' })
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.findOne(id);
    }

    @Patch('me/payment-info')
    @UseGuards(UserAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update the authenticated user own payment coordinates (PayPal, IBAN, Revolut)' })
    @ApiResponse({ status: 200, description: 'Payment info updated' })
    updatePaymentInfo(@Body() dto: UpdatePaymentInfoDto, @Request() req: RequestWithUser) {
        return this.usersService.updatePaymentInfo(req.user.userId as number, dto);
    }

    @Patch(':id')
    @UseGuards(UserAuthGuard, AdminGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update a user (Admin only)' })
    @ApiResponse({ status: 200, description: 'User updated' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
    update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
        return this.usersService.update(id, updateUserDto);
    }

    @Delete(':id')
    @UseGuards(UserAuthGuard, AdminGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete a user (Admin only)' })
    @ApiResponse({ status: 200, description: 'User deleted' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.remove(id);
    }
}
