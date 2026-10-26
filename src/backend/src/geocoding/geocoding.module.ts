import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller.js';
import { GeocodingService } from './geocoding.service.js';

@Module({
    controllers: [GeocodingController],
    providers: [GeocodingService],
    exports: [GeocodingService]
})
export class GeocodingModule {}
