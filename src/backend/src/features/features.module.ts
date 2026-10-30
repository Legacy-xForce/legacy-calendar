import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FeaturesController } from './features.controller.js';
import { FeaturesService } from './features.service.js';

@Module({
    imports: [PrismaModule],
    controllers: [FeaturesController],
    providers: [FeaturesService]
})
export class FeaturesModule {}
