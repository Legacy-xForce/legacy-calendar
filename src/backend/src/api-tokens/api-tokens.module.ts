import { Global, Module } from '@nestjs/common';
import { ApiTokensController } from './api-tokens.controller.js';
import { ApiTokensRepository } from './api-tokens.repository.js';
import { ApiTokensService } from './api-tokens.service.js';

/**
 * Global because the shared JwtAuthGuard reads X-API-Token and is instantiated
 * in every feature module. Exporting the service here keeps that guard working
 * without each module importing the token domain.
 */
@Global()
@Module({
    controllers: [ApiTokensController],
    providers: [ApiTokensService, ApiTokensRepository],
    exports: [ApiTokensService]
})
export class ApiTokensModule {}
