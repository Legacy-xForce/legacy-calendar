import { PartialType } from '@nestjs/swagger';
import { CreateFeatureDto } from './create-feature.dto.js';

export class UpdateFeatureDto extends PartialType(CreateFeatureDto) {}
